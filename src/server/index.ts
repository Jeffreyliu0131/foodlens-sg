import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import {
  getConfig,
  runtimeConfig,
  type ProviderRuntimeConfig,
} from "../config";
import { runFoodLens } from "../core/pipeline";
import { createDependencies } from "../providers/create-dependencies";
import { ProviderValidationError, validateProviderSetup } from "../providers/validate-provider";
import {
  ProviderSetupSchema,
  RecommendationRequestSchema,
} from "../shared/schemas";
import type { ProviderPublicState } from "../shared/types";
import {
  clearProviderSessionCookie,
  ProviderSessionStore,
  providerSessionCookie,
  sessionIdFromCookie,
} from "./provider-session-store";

const config = getConfig();
const sessions = new ProviderSessionStore(config.sessionTtlMs, config.maxSessions);
const distRoot = resolve(process.cwd(), "dist");
const MAX_BODY_BYTES = 24_000;

type ResolvedProvider = {
  runtime: ProviderRuntimeConfig;
  source: ProviderPublicState["source"];
  expiresAt: string | null;
};

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function json(response: ServerResponse, status: number, body: unknown): void {
  setSecurityHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body exceeds the 24 KB limit.");
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function ndjson(response: ServerResponse, value: unknown): void {
  if (!response.writableEnded) response.write(`${JSON.stringify(value)}\n`);
}

function safeRuntimeError(error: unknown): string {
  if (!(error instanceof Error)) return "Research failed.";
  return error.message
    .replace(/sk-or-v1-[a-zA-Z0-9*_\-]+/g, "[redacted API key]")
    .replace(/sk-[a-zA-Z0-9*_\-]+/g, "[redacted API key]")
    .slice(0, 600);
}

function isSecure(request: IncomingMessage): boolean {
  const forwarded = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (
    Boolean((request.socket as { encrypted?: boolean }).encrypted) ||
    protocol?.split(",")[0]?.trim().toLowerCase() === "https"
  );
}

function hasSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function resolveProvider(request: IncomingMessage): ResolvedProvider | null {
  const id = sessionIdFromCookie(request.headers.cookie);
  const session = sessions.get(id);
  if (session) {
    return { runtime: session.config, source: "session", expiresAt: session.expiresAt };
  }
  if (!config.environmentProvider) return null;
  return {
    runtime: config.environmentProvider,
    source:
      config.environmentProvider.provider === "fixture" ? "fixture" : "environment",
    expiresAt: null,
  };
}

function publicProviderState(provider: ResolvedProvider | null): ProviderPublicState {
  if (!provider) {
    return {
      configured: false,
      provider: null,
      model: null,
      source: null,
      expiresAt: null,
      sessionOnly: true,
    };
  }
  return {
    configured: true,
    provider: provider.runtime.provider,
    model: provider.runtime.model,
    source: provider.source,
    expiresAt: provider.expiresAt,
    sessionOnly: provider.source === "session",
  };
}

async function handleConfigPost(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!hasSameOrigin(request)) {
    json(response, 403, { error: "origin_rejected", message: "Request origin rejected." });
    return;
  }
  const abort = new AbortController();
  request.on("aborted", () => abort.abort());
  try {
    const setup = ProviderSetupSchema.parse(await readJsonBody(request));
    await validateProviderSetup(setup, { signal: abort.signal });
    const previousId = sessionIdFromCookie(request.headers.cookie);
    sessions.delete(previousId);
    const session = sessions.create(runtimeConfig(setup, config));
    response.setHeader(
      "Set-Cookie",
      providerSessionCookie(
        session.id,
        config.sessionTtlMs / 1000,
        isSecure(request),
      ),
    );
    json(
      response,
      200,
      publicProviderState({
        runtime: session.config,
        source: "session",
        expiresAt: session.expiresAt,
      }),
    );
  } catch (error) {
    const status = error instanceof ProviderValidationError ? error.status : 400;
    json(response, status, {
      error: error instanceof ProviderValidationError ? "provider_rejected" : "invalid_config",
      message: error instanceof Error ? error.message : "Provider setup failed.",
    });
  }
}

function handleConfigDelete(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (!hasSameOrigin(request)) {
    json(response, 403, { error: "origin_rejected", message: "Request origin rejected." });
    return;
  }
  sessions.delete(sessionIdFromCookie(request.headers.cookie));
  response.setHeader("Set-Cookie", clearProviderSessionCookie(isSecure(request)));
  const environment = config.environmentProvider
    ? {
        runtime: config.environmentProvider,
        source: (config.environmentProvider.provider === "fixture"
          ? "fixture"
          : "environment") as ProviderPublicState["source"],
        expiresAt: null,
      }
    : null;
  json(response, 200, publicProviderState(environment));
}

async function handleRecommendation(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = RecommendationRequestSchema.parse(await readJsonBody(request));
  } catch (error) {
    json(response, 400, {
      error: "invalid_request",
      message: error instanceof Error ? error.message : "Invalid request.",
    });
    return;
  }
  const provider = resolveProvider(request);
  if (!provider) {
    json(response, 409, {
      error: "provider_not_configured",
      message: "Choose OpenRouter or OpenAI and connect one API key first.",
    });
    return;
  }

  setSecurityHeaders(response);
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  const abort = new AbortController();
  request.on("aborted", () => abort.abort());
  response.on("close", () => {
    if (!response.writableEnded) abort.abort();
  });
  try {
    const packet = await runFoodLens(parsed, createDependencies(provider.runtime), {
      signal: abort.signal,
      onTrace: (event) => ndjson(response, { type: "trace", event }),
    });
    ndjson(response, { type: "result", data: packet });
  } catch (error) {
    if (abort.signal.aborted) return;
    ndjson(response, {
      type: "error",
      error: "research_failed",
      message: safeRuntimeError(error),
    });
  } finally {
    if (!response.writableEnded) response.end();
  }
}

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = resolve(join(distRoot, safePath));
  if (!filePath.startsWith(distRoot)) {
    json(response, 404, { error: "not_found" });
    return;
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
    await access(filePath);
  } catch {
    filePath = join(distRoot, "index.html");
    try {
      await access(filePath);
    } catch {
      json(response, 404, {
        error: "web_build_missing",
        message: "Run npm run build:web or use npm run dev.",
      });
      return;
    }
  }
  setSecurityHeaders(response);
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
  );
  response.setHeader(
    "Cache-Control",
    filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  );
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, {
      status: "ok",
      ...publicProviderState(resolveProvider(request)),
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/config") {
    json(response, 200, publicProviderState(resolveProvider(request)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/config") {
    await handleConfigPost(request, response);
    return;
  }
  if (request.method === "DELETE" && url.pathname === "/api/config") {
    handleConfigDelete(request, response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/recommend") {
    await handleRecommendation(request, response);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    json(response, 404, { error: "not_found" });
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    json(response, 405, { error: "method_not_allowed" });
    return;
  }
  await serveStatic(url.pathname, response);
});

server.listen(config.port, config.host, () => {
  process.stdout.write(`FoodLens SG API listening at http://${config.host}:${config.port}\n`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));

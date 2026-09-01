import { randomBytes } from "node:crypto";
import type { ProviderRuntimeConfig } from "../config";

export const PROVIDER_SESSION_COOKIE = "foodlens_provider_session";

type SessionRecord = {
  config: ProviderRuntimeConfig;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number;
};

export type ProviderSession = {
  id: string;
  config: ProviderRuntimeConfig;
  expiresAt: string;
};

export class ProviderSessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxSessions: number,
  ) {}

  create(config: ProviderRuntimeConfig, now = Date.now()): ProviderSession {
    this.sweep(now);
    while (this.sessions.size >= this.maxSessions) {
      const oldest = [...this.sessions.entries()].sort(
        ([, left], [, right]) => left.lastUsedAt - right.lastUsedAt,
      )[0];
      if (!oldest) break;
      this.sessions.delete(oldest[0]);
    }
    const id = randomBytes(32).toString("base64url");
    const expiresAt = now + this.ttlMs;
    this.sessions.set(id, {
      config,
      createdAt: now,
      expiresAt,
      lastUsedAt: now,
    });
    return { id, config, expiresAt: new Date(expiresAt).toISOString() };
  }

  get(id: string | null, now = Date.now()): ProviderSession | null {
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= now) {
      this.sessions.delete(id);
      return null;
    }
    session.lastUsedAt = now;
    return {
      id,
      config: session.config,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  delete(id: string | null): void {
    if (id) this.sessions.delete(id);
  }

  size(now = Date.now()): number {
    this.sweep(now);
    return this.sessions.size;
  }

  private sweep(now: number): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }
}

export function sessionIdFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === PROVIDER_SESSION_COOKIE) {
      const value = valueParts.join("=").trim();
      return value || null;
    }
  }
  return null;
}

export function providerSessionCookie(
  id: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  return [
    `${PROVIDER_SESSION_COOKIE}=${id}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearProviderSessionCookie(secure: boolean): string {
  return providerSessionCookie("", 0, secure);
}

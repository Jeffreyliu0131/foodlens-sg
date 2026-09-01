import type { ProviderSetup } from "../shared/schemas";
import type {
  DecisionPacket,
  ProviderPublicState,
  TraceEvent,
} from "../shared/types";

type StreamMessage =
  | { type: "trace"; event: TraceEvent }
  | { type: "result"; data: DecisionPacket }
  | { type: "error"; error: string; message: string };

export class FoodLensApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FoodLensApiError";
  }
}

async function errorFrom(response: Response): Promise<FoodLensApiError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  return new FoodLensApiError(
    payload?.message || `Request failed with ${response.status}.`,
    payload?.error || "request_failed",
    response.status,
  );
}

export async function fetchProviderConfig(): Promise<ProviderPublicState> {
  const response = await fetch("/api/config", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw await errorFrom(response);
  return response.json() as Promise<ProviderPublicState>;
}

export async function connectProvider(
  setup: ProviderSetup,
): Promise<ProviderPublicState> {
  const response = await fetch("/api/config", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(setup),
  });
  if (!response.ok) throw await errorFrom(response);
  return response.json() as Promise<ProviderPublicState>;
}

export async function disconnectProvider(): Promise<ProviderPublicState> {
  const response = await fetch("/api/config", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) throw await errorFrom(response);
  return response.json() as Promise<ProviderPublicState>;
}

export async function researchRestaurants(
  request: { location: string; query: string },
  options: {
    signal: AbortSignal;
    onTrace: (event: TraceEvent) => void;
  },
): Promise<DecisionPacket> {
  const response = await fetch("/api/recommend", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: options.signal,
  });
  if (!response.ok) throw await errorFrom(response);
  if (!response.body) throw new Error("The server returned no research stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: DecisionPacket | null = null;

  const consume = (line: string): void => {
    if (!line.trim()) return;
    const message = JSON.parse(line) as StreamMessage;
    if (message.type === "trace") options.onTrace(message.event);
    if (message.type === "result") result = message.data;
    if (message.type === "error") {
      throw new FoodLensApiError(message.message, message.error, 200);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
  if (!result) throw new Error("Research ended before a decision packet arrived.");
  return result;
}

import { createHash, randomUUID } from "node:crypto";

export function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 14);
  return `${prefix}_${digest}`;
}

export function requestId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

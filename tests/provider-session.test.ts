import { describe, expect, it } from "vitest";
import type { ProviderRuntimeConfig } from "../src/config";
import {
  ProviderSessionStore,
  providerSessionCookie,
  sessionIdFromCookie,
} from "../src/server/provider-session-store";

const runtime: ProviderRuntimeConfig = {
  provider: "openrouter",
  apiKey: "test-openrouter-secret-value",
  model: "openrouter/auto",
  broadSearchCalls: 8,
  deepSearchCalls: 6,
};

describe("provider session security", () => {
  it("stores the key server-side while the cookie contains only an opaque id", () => {
    const store = new ProviderSessionStore(60_000, 10);
    const session = store.create(runtime, 1_000);
    const cookie = providerSessionCookie(session.id, 60, false);

    expect(session.id).not.toContain(runtime.apiKey!);
    expect(cookie).not.toContain(runtime.apiKey!);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(providerSessionCookie(session.id, 60, true)).toContain("Secure");
    expect(sessionIdFromCookie(cookie)).toBe(session.id);
    expect(store.get(session.id, 2_000)?.config.apiKey).toBe(runtime.apiKey);
  });

  it("expires and deletes credentials", () => {
    const store = new ProviderSessionStore(1_000, 10);
    const session = store.create(runtime, 10_000);
    expect(store.get(session.id, 10_999)).not.toBeNull();
    expect(store.get(session.id, 11_000)).toBeNull();

    const second = store.create(runtime, 20_000);
    store.delete(second.id);
    expect(store.get(second.id, 20_100)).toBeNull();
  });

  it("evicts the least recently used session at the configured cap", () => {
    const store = new ProviderSessionStore(60_000, 2);
    const first = store.create(runtime, 1_000);
    const second = store.create(runtime, 2_000);
    store.get(second.id, 2_500);
    const third = store.create(runtime, 3_000);

    expect(store.get(first.id, 3_100)).toBeNull();
    expect(store.get(second.id, 3_100)).not.toBeNull();
    expect(store.get(third.id, 3_100)).not.toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  ProviderValidationError,
  validateProviderSetup,
} from "../src/providers/validate-provider";

describe("provider setup validation", () => {
  it("validates an OpenRouter key and model without an inference call", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-openrouter-key",
      );
      if (url.endsWith("/api/v1/key")) {
        return new Response(JSON.stringify({ data: { label: "test" } }), { status: 200 });
      }
      expect(url).toContain("/api/v1/model/openrouter/auto");
      return new Response(JSON.stringify({ data: { id: "openrouter/auto" } }), {
        status: 200,
      });
    });

    await validateProviderSetup(
      {
        provider: "openrouter",
        apiKey: "test-openrouter-key",
        model: "openrouter/auto",
      },
      { fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes("chat"))).toBe(true);
  });

  it("stops after an invalid OpenRouter key", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ error: { message: "Invalid key" } }), {
        status: 401,
      }),
    );
    const rejection = expect(
      validateProviderSetup(
        {
          provider: "openrouter",
          apiKey: "invalid-openrouter-key",
          model: "openrouter/auto",
        },
        { fetchImpl },
      ),
    ).rejects;
    await rejection.toMatchObject({ status: 401 } satisfies Partial<ProviderValidationError>);
    await rejection.not.toThrow(/invalid-openrouter-key/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("validates an OpenAI key against the selected model endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://api.openai.com/v1/models/gpt-5.6");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-openai-key",
      );
      return new Response(JSON.stringify({ id: "gpt-5.6" }), { status: 200 });
    });
    await validateProviderSetup(
      { provider: "openai", apiKey: "test-openai-key", model: "gpt-5.6" },
      { fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

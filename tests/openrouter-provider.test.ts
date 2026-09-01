import { describe, expect, it, vi } from "vitest";
import type { ProviderRuntimeConfig } from "../src/config";
import { buildBroadSearchPlan } from "../src/core/search-plan";
import { thaiPasirPanjangFixture } from "../src/fixtures/thai-pasir-panjang";
import { OpenRouterResearchProvider } from "../src/providers/openrouter-provider";

const runtime: ProviderRuntimeConfig = {
  provider: "openrouter",
  apiKey: "test-openrouter-key",
  model: "openrouter/auto",
  broadSearchCalls: 8,
  deepSearchCalls: 6,
};

function openRouterResponse(message: Record<string, unknown>, id: string) {
  return new Response(
    JSON.stringify({
      id,
      choices: [{ message }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("OpenRouter research adapter", () => {
  it("converts web citations into grounded source records through a second extraction call", async () => {
    const sourceRecord = thaiPasirPanjangFixture.broad.records[0];
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);
      if (Array.isArray(body.tools)) {
        return openRouterResponse(
          {
            role: "assistant",
            content: "Super Thai has a Foodpanda listing and Pad See Ew.",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: sourceRecord.sourceUrl,
                  title: sourceRecord.sourceTitle,
                  content: "4.8/5, 100+ reviews. Pad See Ew With Pork S$15.",
                },
              },
            ],
          },
          "search_1",
        );
      }
      return openRouterResponse(
        { role: "assistant", content: JSON.stringify({ records: [sourceRecord], warnings: [] }) },
        "extract_1",
      );
    });
    const provider = new OpenRouterResearchProvider(runtime, fetchImpl);
    const run = await provider.research({
      phase: "broad",
      intent: thaiPasirPanjangFixture.intent,
      plan: buildBroadSearchPlan(thaiPasirPanjangFixture.intent),
      finalists: [],
    });

    expect(run.modelCalls).toBe(2);
    expect(run.observedSources).toEqual([
      { url: sourceRecord.sourceUrl, title: sourceRecord.sourceTitle },
    ]);
    expect(run.payload.records[0].sourceUrl).toBe(sourceRecord.sourceUrl);
    expect(requestBodies[0].tools).toEqual([
      expect.objectContaining({ type: "openrouter:web_search" }),
    ]);
    expect(requestBodies[1].response_format).toBeTruthy();
  });

  it("falls back to prompt-only JSON when strict structured output is unsupported", async () => {
    let calls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({ error: { message: "response_format unsupported" } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      return openRouterResponse(
        { role: "assistant", content: JSON.stringify(thaiPasirPanjangFixture.intent) },
        "fallback_1",
      );
    });
    const provider = new OpenRouterResearchProvider(runtime, fetchImpl);
    const result = await provider.interpret({
      location: "Pasir Panjang, Singapore",
      query: "Thai delivery with Pad See Ew and strong review evidence.",
    });

    expect(result.intent.cuisine).toBe("Thai");
    expect(result.modelCalls).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

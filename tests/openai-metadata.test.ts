import { describe, expect, it } from "vitest";
import { extractSearchMetadata } from "../src/providers/openai-provider";

describe("OpenAI web-search metadata extraction", () => {
  it("collects actual queries, action sources, and URL citations", () => {
    const metadata = extractSearchMetadata({
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            queries: ["thai pasir panjang", "site:foodpanda.sg thai pasir panjang"],
            sources: [
              { url: "https://food.example/a?tracking=1", title: "Restaurant A" },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://food.example/b",
                  title: "Restaurant B",
                },
                {
                  type: "url_citation",
                  url: "https://food.example/a",
                  title: "Duplicate canonical URL",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(metadata.actions.map((action) => action.query)).toEqual([
      "thai pasir panjang",
      "site:foodpanda.sg thai pasir panjang",
    ]);
    expect(metadata.sources).toHaveLength(2);
    expect(metadata.sources.map((source) => source.url)).toContain(
      "https://food.example/b",
    );
  });
});

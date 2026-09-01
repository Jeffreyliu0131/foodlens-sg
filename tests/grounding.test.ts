import { describe, expect, it } from "vitest";
import { groundResearchRun } from "../src/core/grounding";
import type { ProviderResearchRun } from "../src/shared/types";

describe("source grounding", () => {
  it("accepts records from observed URLs and rejects unobserved URLs", () => {
    const run: ProviderResearchRun = {
      phase: "broad",
      payload: {
        records: [
          {
            restaurantName: "Grounded Thai",
            branch: null,
            address: null,
            postalCode: null,
            neighborhood: null,
            phone: null,
            cuisine: ["Thai"],
            sourceTitle: "Observed",
            sourceUrl: "https://food.example/observed?tracking=1",
            sourceKind: "other",
            platform: "other",
            rating: null,
            platformPresence: "unknown",
            deliveryState: "unknown",
            deliveryNote: null,
            menuItems: [],
            priceSignals: [],
            distanceKm: null,
            proximityText: null,
            notes: [],
          },
          {
            restaurantName: "Invented Source Thai",
            branch: null,
            address: null,
            postalCode: null,
            neighborhood: null,
            phone: null,
            cuisine: ["Thai"],
            sourceTitle: "Unobserved",
            sourceUrl: "https://food.example/unobserved",
            sourceKind: "other",
            platform: "other",
            rating: null,
            platformPresence: "unknown",
            deliveryState: "unknown",
            deliveryNote: null,
            menuItems: [],
            priceSignals: [],
            distanceKm: null,
            proximityText: null,
            notes: [],
          },
        ],
        warnings: [],
      },
      observedSources: [
        { url: "https://food.example/observed", title: "Observed result" },
      ],
      actions: [{ type: "search", query: "thai", url: null }],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      modelCalls: 1,
      responseId: null,
    };

    const result = groundResearchRun(run);
    expect(result.run.acceptedRecords).toHaveLength(1);
    expect(result.run.acceptedRecords[0].restaurantName).toBe("Grounded Thai");
    expect(result.run.rejectedRecords).toHaveLength(1);
    expect(result.run.rejectedRecords[0].reason).toContain("not observed");
  });
});

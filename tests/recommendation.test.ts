import { describe, expect, it } from "vitest";
import { buildEvidence } from "../src/core/evidence";
import { rankRestaurants } from "../src/core/ranking";
import { finalizeRecommendation } from "../src/core/recommendation";
import { resolveRestaurants } from "../src/core/resolution";
import { testIntent, testRecord } from "./helpers";

describe("recommendation grounding", () => {
  it("discards a generated dish that is not backed by a cited menu claim", () => {
    const record = testRecord({
      restaurantName: "Grounded Menu Thai",
      sourceUrl: "https://food.example/grounded-menu",
      rating: { value: 4.7, scale: 5, reviewCount: 500, rawReviewCount: "500" },
      menuItems: [
        {
          name: "Pad See Ew",
          description: "Wide noodles with pork.",
          priceSgd: 14,
          priceText: "S$14",
          desiredDishMatch: true,
          flavorTags: ["savory"],
        },
      ],
    });
    const intent = testIntent({ desiredDishes: ["Pad See Ew"] });
    const resolution = resolveRestaurants([record]);
    const evidence = buildEvidence(resolution.restaurants);
    const ranked = rankRestaurants(resolution.restaurants, intent, evidence);
    const ratingClaim = evidence.find((claim) => claim.kind === "rating")!;
    const finalized = finalizeRecommendation(ranked, evidence, intent, {
      decisionSummary: "Choose Grounded Menu Thai.",
      options: [
        {
          entityId: ranked[0].entityId,
          verdict: "Best match.",
          fitExplanation: "Strong evidence.",
          recommendedDishes: [
            {
              name: "Lobster Thermidor",
              reason: "Invented dish.",
              evidenceIds: [ratingClaim.evidenceId],
            },
          ],
          citedEvidenceIds: [ratingClaim.evidenceId],
          uncertainties: [],
        },
      ],
      globalWarnings: [],
    });

    expect(finalized.options[0].recommendedDishes.map((dish) => dish.name)).toEqual([
      "Pad See Ew",
    ]);
    expect(finalized.warnings.some((warning) => warning.includes("discarded"))).toBe(
      true,
    );
  });
});

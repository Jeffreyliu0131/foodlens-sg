import { describe, expect, it } from "vitest";
import { testIntent, testRecord } from "./helpers";
import { resolveRestaurants } from "../src/core/resolution";
import { buildEvidence } from "../src/core/evidence";
import { rankRestaurants } from "../src/core/ranking";
import { finalizeRecommendation } from "../src/core/recommendation";

function decide(overrides: Parameters<typeof testIntent>[0] = {}, deliveryState: "unavailable" | "exact_address_eligible" | "unknown" = "unknown") {
  const record = testRecord({ restaurantName: "Synthetic Thai", sourceUrl: "https://example.com/menu", deliveryState,
    menuItems: [{ name: "Pad Thai", description: null, priceSgd: 50, priceText: "S$50", desiredDishMatch: true, flavorTags: [] }] });
  const intent = testIntent(overrides);
  const { restaurants } = resolveRestaurants([record]);
  const evidence = buildEvidence(restaurants);
  const ranked = rankRestaurants(restaurants, intent, evidence);
  return { intent, ranked, evidence, output: finalizeRecommendation(ranked, evidence, intent) };
}

describe("decision eligibility and factual rendering", () => {
  it("does not recommend any option when delivery and budget fail", () => {
    const { output } = decide({ deliveryRequired: true, budgetSgdMax: 10, budgetBasis: "per_person", hardConstraints: ["budget under S$10"] }, "unavailable");
    expect(output.options).toEqual([]);
    expect(output.warnings.join(" ")).toContain("hard budget");
    expect(output.warnings.join(" ")).toContain("unavailable");
  });
  it("keeps unknown delivery out of recommendations and accepts verified eligibility", () => {
    expect(decide({ deliveryRequired: true }).output.options).toEqual([]);
    expect(decide({ deliveryRequired: true }, "exact_address_eligible").output.options).toHaveLength(1);
  });
  it("abstains on unsupported constraints and unverifiable whole-order budgets", () => {
    expect(decide({ hardConstraints: ["Must be peanut-free"] }).output.options).toEqual([]);
    expect(decide({ budgetSgdMax: 100, budgetBasis: "per_person", hardConstraints: ["under $100 and peanut-free"] }).output.options).toEqual([]);
    expect(decide({ budgetSgdMax: 100, budgetBasis: "whole_order", hardConstraints: ["budget under 100"] }).output.options).toEqual([]);
  });
  it("matches individual desired dishes rather than trusting a shared boolean", () => {
    const { ranked } = decide({ desiredDishes: ["Pad Thai", "Tom Yum"] });
    expect(ranked[0].components.find(c => c.key === "menu")?.explanation).toContain("1/2 desired dishes");
  });
  it("cannot pass invented claims even with valid evidence IDs", () => {
    const { ranked, evidence, intent } = decide();
    const output = finalizeRecommendation(ranked, evidence, intent, {
      decisionSummary: "Guaranteed free delivery in 5 minutes", globalWarnings: ["Invented fact"],
      options: [{ entityId: ranked[0].entityId, verdict: "Guaranteed allergy-safe", fitExplanation: "Invented fact", recommendedDishes: [], citedEvidenceIds: [evidence[0].evidenceId], uncertainties: [] }],
    });
    expect(output.options).toHaveLength(1);
    expect(JSON.stringify(output)).not.toMatch(/Guaranteed|Invented fact/);
  });
});

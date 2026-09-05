import { describe, expect, it } from "vitest";
import { runFoodLens } from "../src/core/pipeline";
import { FixtureProvider } from "../src/providers/fixture-provider";
import {
  thaiPasirPanjangFixture,
  thaiPasirPanjangRequest,
} from "../src/fixtures/thai-pasir-panjang";

describe("Thai Pasir Panjang fixture pipeline", () => {
  it("runs search, grounding, resolution, ranking, and recommendation end to end", async () => {
    const provider = new FixtureProvider(thaiPasirPanjangFixture);
    const packet = await runFoodLens(thaiPasirPanjangRequest, {
      intentModel: provider,
      searchProvider: provider,
      provider: { kind: "fixture", model: "dated-fixture" },
    });

    expect(packet.restaurants.length).toBeGreaterThanOrEqual(4);
    // The dated fixture proves listing presence, not exact-address delivery.
    expect(packet.recommendations).toEqual([]);
    expect(packet.warnings.some(w => w.includes("eligibility is unverified"))).toBe(true);
    expect(packet.metrics.rejectedRecordCount).toBe(0);
    expect(packet.identityMatches.some((match) => match.decision === "uncertain")).toBe(
      true,
    );

    const evidenceIds = new Set(packet.evidence.map((claim) => claim.evidenceId));
    for (const option of packet.recommendations) {
      expect(option.citedEvidenceIds.every((id) => evidenceIds.has(id))).toBe(true);
      for (const dish of option.recommendedDishes) {
        expect(dish.evidenceIds.every((id) => evidenceIds.has(id))).toBe(true);
      }
    }

    for (const stage of [
      "intent",
      "planning",
      "broad_research",
      "grounding",
      "resolution",
      "deep_research",
      "final_ranking",
      "recommendation",
      "complete",
    ] as const) {
      expect(packet.trace.some((event) => event.stage === stage)).toBe(true);
    }
  });
});


it("renders eligible synthetic options without calling the untrusted composer", async () => {
  const fixture = structuredClone(thaiPasirPanjangFixture);
  fixture.intent.deliveryRequired = false;
  fixture.intent.hardConstraints = [];
  const provider = new FixtureProvider(fixture);
  provider.compose = async () => { throw new Error("Composer must not be called"); };
  const packet = await runFoodLens(thaiPasirPanjangRequest, { intentModel: provider, searchProvider: provider, provider: { kind: "fixture", model: "synthetic-no-delivery" } });
  expect(packet.recommendations.length).toBeGreaterThan(0);
  expect(packet.recommendations[0].rank).toBe(1);
});

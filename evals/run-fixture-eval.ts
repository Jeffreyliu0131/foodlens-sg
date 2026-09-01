import { runFoodLens } from "../src/core/pipeline";
import { FixtureProvider } from "../src/providers/fixture-provider";
import {
  thaiPasirPanjangFixture,
  thaiPasirPanjangRequest,
} from "../src/fixtures/thai-pasir-panjang";

const provider = new FixtureProvider(thaiPasirPanjangFixture);
const packet = await runFoodLens(thaiPasirPanjangRequest, {
  intentModel: provider,
  searchProvider: provider,
  provider: { kind: "fixture", model: "dated-fixture" },
});

const evidenceIds = new Set(packet.evidence.map((claim) => claim.evidenceId));
const unsupportedRecommendationClaims = packet.recommendations.flatMap((option) => [
  ...option.citedEvidenceIds.filter((id) => !evidenceIds.has(id)),
  ...option.recommendedDishes.flatMap((dish) =>
    dish.evidenceIds.filter((id) => !evidenceIds.has(id)),
  ),
]);
const candidateNames = packet.restaurants.map((restaurant) => restaurant.displayName);
const checks = {
  minimumResolvedCandidates: packet.restaurants.length >= 4,
  minimumObservedSources: packet.sources.length >= 4,
  noUnsupportedRecommendationClaims: unsupportedRecommendationClaims.length === 0,
  decisiveTopChoice: packet.recommendations[0]?.rank === 1,
  desiredDishGrounded: packet.recommendations.some((option) =>
    option.recommendedDishes.some((dish) => /pad see ew|basil/i.test(dish.name)),
  ),
  fullPipelineTrace: [
    "intent",
    "planning",
    "broad_research",
    "grounding",
    "resolution",
    "deep_research",
    "final_ranking",
    "recommendation",
  ].every((stage) => packet.trace.some((event) => event.stage === stage)),
};
const passed = Object.values(checks).every(Boolean);

process.stdout.write(
  `${JSON.stringify(
    {
      eval: "thai-pasir-panjang-fixture",
      passed,
      checks,
      topChoice: packet.recommendations[0]?.restaurantName ?? null,
      candidateNames,
      metrics: packet.metrics,
      warning: "Fixture output validates reproducibility, not current restaurant facts.",
    },
    null,
    2,
  )}\n`,
);

if (!passed) process.exitCode = 1;

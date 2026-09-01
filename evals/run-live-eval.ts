import { readFile } from "node:fs/promises";
import { getConfig } from "../src/config";
import { runFoodLens } from "../src/core/pipeline";
import { createDependencies } from "../src/providers/create-dependencies";

const scenario = JSON.parse(
  await readFile(new URL("./thai-pasir-panjang.json", import.meta.url), "utf8"),
) as {
  id: string;
  input: { location: string; query: string };
  historicalContextOnly: string[];
  thresholds: {
    minimumResolvedCandidates: number;
    minimumObservedSources: number;
    maximumUnsupportedRecommendationClaims: number;
  };
};

const runtime = getConfig().environmentProvider;
if (!runtime || runtime.provider === "fixture") {
  throw new Error(
    "Configure FOODLENS_PROVIDER=openai or openrouter and its matching API key for this live eval.",
  );
}
const packet = await runFoodLens(scenario.input, createDependencies(runtime));
const sourceIds = new Set(packet.sources.map((source) => source.sourceId));
const evidenceIds = new Set(packet.evidence.map((claim) => claim.evidenceId));
const ungroundedEvidence = packet.evidence.filter(
  (claim) => !sourceIds.has(claim.sourceId),
);
const unsupportedRecommendationClaims = packet.recommendations.flatMap((option) => [
  ...option.citedEvidenceIds.filter((id) => !evidenceIds.has(id)),
  ...option.recommendedDishes.flatMap((dish) =>
    dish.evidenceIds.filter((id) => !evidenceIds.has(id)),
  ),
]);
const normalizedNames = packet.restaurants.map((restaurant) =>
  restaurant.displayName.toLowerCase(),
);
const historicalRecall = scenario.historicalContextOnly.filter((name) =>
  normalizedNames.some((candidate) => candidate.includes(name.toLowerCase())),
);
const checks = {
  minimumResolvedCandidates:
    packet.restaurants.length >= scenario.thresholds.minimumResolvedCandidates,
  minimumObservedSources:
    packet.sources.length >= scenario.thresholds.minimumObservedSources,
  evidenceHasObservedSources: ungroundedEvidence.length === 0,
  unsupportedRecommendationClaims:
    unsupportedRecommendationClaims.length <=
    scenario.thresholds.maximumUnsupportedRecommendationClaims,
  hasClearTopChoice: packet.recommendations[0]?.rank === 1,
};

process.stdout.write(
  `${JSON.stringify(
    {
      eval: scenario.id,
      evaluatedAt: new Date().toISOString(),
      passed: Object.values(checks).every(Boolean),
      checks,
      historicalRecall: {
        found: historicalRecall,
        note: "Reported for context only; not a pass/fail condition because restaurant data changes.",
      },
      topChoice: packet.recommendations[0]?.restaurantName ?? null,
      warnings: packet.warnings,
      metrics: packet.metrics,
    },
    null,
    2,
  )}\n`,
);

if (!Object.values(checks).every(Boolean)) process.exitCode = 1;

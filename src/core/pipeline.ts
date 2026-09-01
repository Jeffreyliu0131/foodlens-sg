import {
  RecommendationRequestSchema,
  type ProviderSource,
  type Usage,
} from "../shared/schemas";
import type {
  DecisionMetrics,
  DecisionPacket,
  FoodLensDependencies,
  PipelineOptions,
  SourceRecord,
} from "../shared/types";
import { buildEvidence } from "./evidence";
import { groundResearchRun } from "./grounding";
import { requestId } from "./id";
import { rankRestaurants } from "./ranking";
import { finalizeRecommendation } from "./recommendation";
import { resolveRestaurants } from "./resolution";
import {
  buildBroadSearchPlan,
  buildDeepSearchPlan,
  normalizeIntent,
} from "./search-plan";
import { TraceRecorder } from "./trace";
import { canonicalizeUrl } from "./url";

function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(total: Usage, next: Usage): void {
  total.inputTokens += next.inputTokens;
  total.outputTokens += next.outputTokens;
  total.totalTokens += next.totalTokens;
}

function uniqueSources(
  sources: Array<ProviderSource & { sourceId: string }>,
): Array<ProviderSource & { sourceId: string }> {
  const unique = new Map<string, ProviderSource & { sourceId: string }>();
  for (const source of sources) {
    const canonical = canonicalizeUrl(source.url);
    if (canonical && !unique.has(canonical)) unique.set(canonical, source);
  }
  return [...unique.values()];
}

export async function runFoodLens(
  rawRequest: unknown,
  dependencies: FoodLensDependencies,
  options: PipelineOptions = {},
): Promise<DecisionPacket> {
  const startedAt = Date.now();
  const decisionId = requestId("decision");
  const trace = new TraceRecorder(options.onTrace);
  const totalUsage = emptyUsage();
  let modelCalls = 0;
  let searchActions = 0;
  let rejectedRecordCount = 0;

  const request = await trace.step(
    "request",
    "Validating the decision request.",
    {},
    () => RecommendationRequestSchema.parse(rawRequest),
    (value) => ({
      summary: "Request validated.",
      details: { location: value.location, queryLength: value.query.length },
    }),
  );

  const intentResult = await trace.step(
    "intent",
    "Interpreting hard constraints and soft preferences.",
    {},
    () => dependencies.intentModel.interpret(request, options.signal),
    (value) => ({
      summary: "Request criteria interpreted.",
      details: {
        cuisine: value.intent.cuisine,
        desiredDishes: value.intent.desiredDishes,
        deliveryRequired: value.intent.deliveryRequired,
        budgetSgdMax: value.intent.budgetSgdMax,
        hardConstraints: value.intent.hardConstraints,
      },
    }),
  );
  modelCalls += intentResult.modelCalls;
  addUsage(totalUsage, intentResult.usage);
  const intent = normalizeIntent({ ...intentResult.intent, location: request.location });

  const broadPlan = await trace.step(
    "planning",
    "Building an adaptive broad-search plan.",
    {},
    () => buildBroadSearchPlan(intent),
    (plan) => ({
      summary: `${plan.queries.length} broad-search queries planned.`,
      details: { queries: plan.queries },
    }),
  );

  const broadRun = await trace.step(
    "broad_research",
    "Discovering candidates and cross-platform evidence.",
    { plannedQueries: broadPlan.queries.map((query) => query.query) },
    () =>
      dependencies.searchProvider.research(
        { phase: "broad", intent, plan: broadPlan, finalists: [] },
        options.signal,
      ),
    (run) => ({
      summary: `${run.payload.records.length} raw source records retrieved.`,
      details: {
        actualSearches: run.actions,
        sources: run.observedSources,
        providerWarnings: run.payload.warnings,
      },
    }),
  );
  modelCalls += broadRun.modelCalls;
  searchActions += broadRun.actions.length;
  addUsage(totalUsage, broadRun.usage);

  const broadGrounding = await trace.step(
    "grounding",
    "Checking every extracted record against observed search sources.",
    {},
    () => groundResearchRun(broadRun),
    (result) => ({
      summary: `${result.run.acceptedRecords.length} grounded records accepted; ${result.run.rejectedRecords.length} rejected.`,
      details: {
        acceptedRestaurants: result.run.acceptedRecords.map(
          (record) => record.restaurantName,
        ),
        rejected: result.run.rejectedRecords.map((item) => ({
          restaurantName: item.record.restaurantName,
          sourceUrl: item.record.sourceUrl,
          reason: item.reason,
        })),
      },
    }),
  );
  rejectedRecordCount += broadGrounding.run.rejectedRecords.length;

  const preliminary = await trace.step(
    "resolution",
    "Resolving branch identities without silently merging uncertain matches.",
    {},
    () => {
      const resolution = resolveRestaurants(broadGrounding.run.acceptedRecords);
      const evidence = buildEvidence(resolution.restaurants);
      const ranked = rankRestaurants(resolution.restaurants, intent, evidence);
      return { resolution, evidence, ranked };
    },
    (result) => ({
      summary: `${result.resolution.restaurants.length} candidate restaurants resolved.`,
      details: {
        mergedMatches: result.resolution.matches.filter(
          (match) => match.decision === "merge",
        ),
        uncertainMatches: result.resolution.matches.filter(
          (match) => match.decision === "uncertain",
        ),
      },
    }),
  );

  await trace.note(
    "preliminary_ranking",
    "completed",
    "Preliminary shortlist ranked from deterministic components.",
    {
      shortlist: preliminary.ranked.slice(0, 3).map((item) => ({
        rank: item.rank,
        entityId: item.entityId,
        restaurantName: item.restaurant.displayName,
        score: item.score,
        componentLabels: Object.fromEntries(
          item.components.map((component) => [component.key, component.label]),
        ),
      })),
    },
  );

  const finalists = preliminary.ranked.slice(0, 3).map((item) => item.restaurant);
  const deepPlan = buildDeepSearchPlan(intent, finalists);
  let allRecords: SourceRecord[] = [...broadGrounding.run.acceptedRecords];
  let allSources = [...broadGrounding.sources];
  const providerWarnings = [...broadRun.payload.warnings];

  if (finalists.length > 0 && deepPlan.queries.length > 0) {
    await trace.note(
      "planning",
      "completed",
      `${deepPlan.queries.length} finalist-verification queries planned.`,
      { queries: deepPlan.queries },
    );
    const deepRun = await trace.step(
      "deep_research",
      "Verifying the strongest candidates more deeply.",
      { finalists: finalists.map((restaurant) => restaurant.displayName) },
      () =>
        dependencies.searchProvider.research(
          { phase: "deep", intent, plan: deepPlan, finalists },
          options.signal,
        ),
      (run) => ({
        summary: `${run.payload.records.length} finalist source records retrieved.`,
        details: {
          actualSearches: run.actions,
          sources: run.observedSources,
          providerWarnings: run.payload.warnings,
        },
      }),
    );
    modelCalls += deepRun.modelCalls;
    searchActions += deepRun.actions.length;
    addUsage(totalUsage, deepRun.usage);
    providerWarnings.push(...deepRun.payload.warnings);

    const deepGrounding = await trace.step(
      "grounding",
      "Grounding finalist evidence against observed sources.",
      {},
      () => groundResearchRun(deepRun),
      (result) => ({
        summary: `${result.run.acceptedRecords.length} finalist records accepted; ${result.run.rejectedRecords.length} rejected.`,
        details: {
          rejected: result.run.rejectedRecords.map((item) => ({
            restaurantName: item.record.restaurantName,
            sourceUrl: item.record.sourceUrl,
            reason: item.reason,
          })),
        },
      }),
    );
    rejectedRecordCount += deepGrounding.run.rejectedRecords.length;
    allRecords = [...allRecords, ...deepGrounding.run.acceptedRecords];
    allSources = [...allSources, ...deepGrounding.sources];
  }

  const finalState = await trace.step(
    "final_ranking",
    "Re-resolving and ranking with finalist evidence.",
    {},
    () => {
      const resolution = resolveRestaurants(allRecords);
      const evidence = buildEvidence(resolution.restaurants);
      const ranked = rankRestaurants(resolution.restaurants, intent, evidence);
      return { resolution, evidence, ranked };
    },
    (result) => ({
      summary:
        result.ranked.length > 0
          ? `${result.ranked[0].restaurant.displayName} ranked first after deep research.`
          : "No grounded candidate remained after validation.",
      details: {
        ranking: result.ranked.slice(0, 5).map((item) => ({
          rank: item.rank,
          entityId: item.entityId,
          restaurantName: item.restaurant.displayName,
          score: item.score,
          hardConstraintFailures: item.hardConstraintFailures,
        })),
      },
    }),
  );

  let composed: Awaited<ReturnType<typeof dependencies.intentModel.compose>> | undefined;
  if (finalState.ranked.length > 0) {
    composed = await trace.step(
      "recommendation",
      "Writing a concise decision from validated evidence IDs.",
      {},
      () =>
        dependencies.intentModel.compose(
          {
            request,
            intent,
            ranked: finalState.ranked,
            evidence: finalState.evidence,
          },
          options.signal,
        ),
      () => ({
        summary: "Grounded recommendation copy generated.",
        details: {},
      }),
    );
    modelCalls += composed.modelCalls;
    addUsage(totalUsage, composed.usage);
  }

  const finalized = finalizeRecommendation(
    finalState.ranked,
    finalState.evidence,
    intent,
    composed?.recommendation,
  );
  const sources = uniqueSources(allSources);
  const warnings = [
    ...intent.interpretationWarnings,
    ...providerWarnings,
    ...finalized.warnings,
    ...(rejectedRecordCount > 0
      ? [`${rejectedRecordCount} extracted records were rejected by the source-membership guard.`]
      : []),
  ];
  const metrics: DecisionMetrics = {
    latencyMs: Date.now() - startedAt,
    modelCalls,
    searchActions,
    sourceCount: sources.length,
    acceptedRecordCount: allRecords.length,
    rejectedRecordCount,
    ...totalUsage,
  };

  await trace.note("complete", "completed", "Decision packet completed.", {
    decisionId,
    recommendationCount: finalized.options.length,
    metrics,
  });

  return {
    decisionId,
    generatedAt: new Date().toISOString(),
    provider: dependencies.provider,
    request,
    intent,
    searchPlans: finalists.length > 0 ? [broadPlan, deepPlan] : [broadPlan],
    decisionSummary: finalized.decisionSummary,
    recommendations: finalized.options,
    restaurants: finalState.resolution.restaurants,
    evidence: finalState.evidence,
    sources,
    identityMatches: finalState.resolution.matches.filter(
      (match) => match.decision !== "separate",
    ),
    warnings: [...new Set(warnings)],
    trace: trace.events,
    metrics,
  };
}

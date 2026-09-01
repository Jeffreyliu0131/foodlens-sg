import type {
  Intent,
  ProviderSource,
  ResearchPayload,
  SearchAction,
  Usage,
} from "../shared/schemas";
import type {
  CompositionResult,
  IntentModel,
  IntentResult,
  ProviderResearchRun,
  SearchProvider,
  SearchProviderInput,
} from "../shared/types";

const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export type FixtureData = {
  intent: Intent;
  broad: ResearchPayload;
  deep: ResearchPayload;
  broadActions?: SearchAction[];
  deepActions?: SearchAction[];
};

function sourcesFrom(payload: ResearchPayload): ProviderSource[] {
  return [
    ...new Map(
      payload.records.map((record) => [
        record.sourceUrl,
        { url: record.sourceUrl, title: record.sourceTitle },
      ]),
    ).values(),
  ];
}

export class FixtureProvider implements IntentModel, SearchProvider {
  constructor(private readonly data: FixtureData) {}

  async interpret(): Promise<IntentResult> {
    return {
      intent: structuredClone(this.data.intent),
      usage: ZERO_USAGE,
      modelCalls: 1,
      responseId: "fixture_intent",
    };
  }

  async research(input: SearchProviderInput): Promise<ProviderResearchRun> {
    const payload = structuredClone(
      input.phase === "broad" ? this.data.broad : this.data.deep,
    );
    const actions = structuredClone(
      input.phase === "broad"
        ? this.data.broadActions ??
            input.plan.queries.map((query) => ({
              type: "search" as const,
              query: query.query,
              url: null,
            }))
        : this.data.deepActions ??
            input.plan.queries.map((query) => ({
              type: "search" as const,
              query: query.query,
              url: null,
            })),
    );
    return {
      phase: input.phase,
      payload,
      observedSources: sourcesFrom(payload),
      actions,
      usage: ZERO_USAGE,
      modelCalls: 1,
      responseId: `fixture_${input.phase}`,
    };
  }

  async compose(
    input: Parameters<IntentModel["compose"]>[0],
  ): Promise<CompositionResult> {
    const options = input.ranked.slice(0, 3).map((ranked) => {
      const claims = input.evidence.filter(
        (claim) => claim.entityId === ranked.entityId,
      );
      const menu = claims.filter((claim) => claim.kind === "menu_item").slice(0, 3);
      return {
        entityId: ranked.entityId,
        verdict: ranked.rank === 1 ? "Best overall match." : "A useful alternative.",
        fitExplanation:
          ranked.components
            .filter(
              (component) =>
                component.label === "strong" || component.label === "solid",
            )
            .slice(0, 2)
            .map((component) => component.explanation)
            .join(" ") || "This option is supported by the available evidence.",
        recommendedDishes: menu.map((claim) => ({
          name: claim.value.split(" | ")[0] ?? claim.value,
          reason: "This dish appears in a grounded menu record.",
          evidenceIds: [claim.evidenceId],
        })),
        citedEvidenceIds: claims.slice(0, 16).map((claim) => claim.evidenceId),
        uncertainties: ranked.warnings,
      };
    });

    return {
      recommendation: {
        decisionSummary:
          options.length > 0
            ? `${input.ranked[0].restaurant.displayName} is the best supported fixture match.`
            : "No fixture decision could be made.",
        options,
        globalWarnings: [
          "Fixture output validates the pipeline, not current restaurant facts.",
        ],
      },
      usage: ZERO_USAGE,
      modelCalls: 1,
      responseId: "fixture_composition",
    };
  }
}

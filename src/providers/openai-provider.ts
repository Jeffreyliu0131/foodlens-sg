import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ProviderRuntimeConfig } from "../config";
import {
  ComposedRecommendationSchema,
  IntentSchema,
  ResearchPayloadSchema,
  type ProviderSource,
  type SearchAction,
  type Usage,
} from "../shared/schemas";
import type {
  CompositionResult,
  IntentModel,
  IntentResult,
  ProviderResearchRun,
  SearchProvider,
  SearchProviderInput,
} from "../shared/types";
import { canonicalizeUrl } from "../core/url";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function usageOf(response: unknown): Usage {
  if (!isRecord(response) || !isRecord(response.usage)) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const usage = response.usage;
  return {
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
    totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : 0,
  };
}

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Public web source";
  }
}

export function extractSearchMetadata(response: unknown): {
  sources: ProviderSource[];
  actions: SearchAction[];
} {
  if (!isRecord(response) || !Array.isArray(response.output)) {
    return { sources: [], actions: [] };
  }

  const sources = new Map<string, ProviderSource>();
  const actions: SearchAction[] = [];
  const addSource = (url: unknown, title: unknown): void => {
    if (typeof url !== "string") return;
    const canonical = canonicalizeUrl(url);
    if (!canonical) return;
    if (!sources.has(canonical)) {
      sources.set(canonical, {
        url,
        title: typeof title === "string" && title.trim() ? title : titleFromUrl(url),
      });
    }
  };

  for (const item of response.output) {
    if (!isRecord(item)) continue;

    if (item.type === "web_search_call" && isRecord(item.action)) {
      const action = item.action;
      const actionType =
        action.type === "search" ||
        action.type === "open_page" ||
        action.type === "find_in_page"
          ? action.type
          : "unknown";
      const queries = Array.isArray(action.queries)
        ? action.queries.filter((value): value is string => typeof value === "string")
        : typeof action.query === "string"
          ? [action.query]
          : [];
      if (queries.length === 0) {
        actions.push({
          type: actionType,
          query: null,
          url: typeof action.url === "string" ? action.url : null,
        });
      } else {
        for (const query of queries) {
          actions.push({
            type: actionType,
            query,
            url: typeof action.url === "string" ? action.url : null,
          });
        }
      }
      if (Array.isArray(action.sources)) {
        for (const source of action.sources) {
          if (isRecord(source)) addSource(source.url, source.title);
        }
      }
    }

    if (item.type === "message" && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (!isRecord(content) || !Array.isArray(content.annotations)) continue;
        for (const annotation of content.annotations) {
          if (isRecord(annotation) && annotation.type === "url_citation") {
            addSource(annotation.url, annotation.title);
          }
        }
      }
    }
  }

  return { sources: [...sources.values()], actions };
}

function responseIdOf(response: unknown): string | null {
  return isRecord(response) && typeof response.id === "string" ? response.id : null;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "OPENAI_API_KEY is not configured. Copy .env.example to .env and add a server-side API key.",
    );
    this.name = "MissingApiKeyError";
  }
}

export class OpenAIResearchProvider implements IntentModel, SearchProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly broadSearchCalls: number;
  private readonly deepSearchCalls: number;

  constructor(config: ProviderRuntimeConfig) {
    if (!config.apiKey) throw new MissingApiKeyError();
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.broadSearchCalls = config.broadSearchCalls;
    this.deepSearchCalls = config.deepSearchCalls;
  }

  async interpret(
    request: Parameters<IntentModel["interpret"]>[0],
    signal?: AbortSignal,
  ): Promise<IntentResult> {
    const response = await this.client.responses.parse(
      {
        model: this.model,
        store: false,
        input: [
          {
            role: "system",
            content: [
              "Extract a restaurant decision intent for Singapore.",
              "Use only the user's words and explicit form location.",
              "Separate hard constraints from soft preferences.",
              "Do not invent a budget, party size, dish, delivery requirement, or location detail.",
              "Set six relative importance weights from 0 to 1. The application will normalize them.",
              "Put genuine ambiguity in interpretationWarnings.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(request),
          },
        ],
        text: {
          format: zodTextFormat(IntentSchema, "foodlens_intent"),
        },
      },
      { signal },
    );

    if (!response.output_parsed) {
      throw new Error("The intent model returned no structured intent.");
    }
    return {
      intent: IntentSchema.parse(response.output_parsed),
      usage: usageOf(response),
      modelCalls: 1,
      responseId: responseIdOf(response),
    };
  }

  async research(
    input: SearchProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderResearchRun> {
    const finalists = input.finalists.map((restaurant) => ({
      entityId: restaurant.entityId,
      displayName: restaurant.displayName,
      branch: restaurant.branch,
      address: restaurant.address,
      postalCode: restaurant.postalCode,
    }));
    const maxToolCalls =
      input.phase === "broad" ? this.broadSearchCalls : this.deepSearchCalls;
    const response = await this.client.responses.parse(
      {
        model: this.model,
        store: false,
        max_tool_calls: maxToolCalls,
        reasoning: { effort: "low" },
        tools: [
          {
            type: "web_search",
            external_web_access: true,
            user_location: {
              type: "approximate",
              country: "SG",
              city: "Singapore",
              region: "Singapore",
            },
          },
        ],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        input: [
          {
            role: "system",
            content: [
              "You are the retrieval and structured-extraction layer for FoodLens SG.",
              "Search the live public web. Execute multiple queries from the supplied plan instead of stopping at the first candidates.",
              "Return one source record per restaurant branch per source page. Do not merge cross-source identities.",
              "Use a sourceUrl exactly as it appeared in a web-search result or opened page.",
              "Never supply current ratings, review counts, addresses, menu items, prices, platform presence, or delivery states from memory.",
              "Use null or unknown when a page does not establish a field.",
              "A Foodpanda listing establishes listing_found only. Do not claim accepting_orders, exact_address_eligible, or eta_known unless the page explicitly establishes that exact state.",
              "A page label such as CLOSED may be time-specific. Record unavailable only when the source clearly establishes current unavailability, and explain it in deliveryNote.",
              "Classify indirect pages that quote Google ratings as google_aggregate, not google_maps.",
              "For broad research, prioritize candidate recall and aim for at least six plausible branch-level candidates when public evidence permits.",
              "For deep research, research only the supplied finalists and resolve missing or conflicting evidence.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              phase: input.phase,
              intent: input.intent,
              plan: input.plan,
              finalists,
            }),
          },
        ],
        text: {
          format: zodTextFormat(
            ResearchPayloadSchema,
            `foodlens_${input.phase}_research`,
          ),
        },
      },
      { signal },
    );

    if (!response.output_parsed) {
      throw new Error(`The ${input.phase} search returned no structured payload.`);
    }
    const metadata = extractSearchMetadata(response);
    return {
      phase: input.phase,
      payload: ResearchPayloadSchema.parse(response.output_parsed),
      observedSources: metadata.sources,
      actions: metadata.actions,
      usage: usageOf(response),
      modelCalls: 1,
      responseId: responseIdOf(response),
    };
  }

  async compose(
    input: Parameters<IntentModel["compose"]>[0],
    signal?: AbortSignal,
  ): Promise<CompositionResult> {
    const top = input.ranked.slice(0, 3);
    const entityIds = new Set(top.map((item) => item.entityId));
    const evidence = input.evidence.filter((claim) => entityIds.has(claim.entityId));
    const compact = top.map((item) => ({
      rank: item.rank,
      entityId: item.entityId,
      restaurantName: item.restaurant.displayName,
      branch: item.restaurant.branch,
      confidence: item.restaurant.evidenceConfidence,
      score: item.score,
      components: item.components.map((component) => ({
        key: component.key,
        label: component.label,
        explanation: component.explanation,
        evidenceIds: component.evidenceIds,
      })),
      hardConstraintFailures: item.hardConstraintFailures,
      warnings: item.warnings,
      evidence: evidence
        .filter((claim) => claim.entityId === item.entityId)
        .map((claim) => ({
          evidenceId: claim.evidenceId,
          kind: claim.kind,
          label: claim.label,
          value: claim.value,
          sourceId: claim.sourceId,
        })),
    }));

    const response = await this.client.responses.parse(
      {
        model: this.model,
        store: false,
        input: [
          {
            role: "system",
            content: [
              "Write a concise, decisive restaurant recommendation from validated evidence only.",
              "Preserve the supplied ranking and entity IDs exactly.",
              "Normally make rank 1 the clear winner unless it has a hard-constraint failure.",
              "Every restaurant fact and recommended dish must cite one or more supplied evidence IDs.",
              "Do not add a dish, price, rating, review count, address, delivery claim, or platform claim that is absent from the evidence list.",
              "State uncertainty directly. A listing is not proof of exact-address delivery eligibility.",
              "Do not expose hidden reasoning. Explain fit using the visible criteria, component labels, and evidence.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              request: input.request,
              intent: input.intent,
              rankedOptions: compact,
            }),
          },
        ],
        text: {
          format: zodTextFormat(
            ComposedRecommendationSchema,
            "foodlens_recommendation",
          ),
        },
      },
      { signal },
    );

    if (!response.output_parsed) {
      throw new Error("The recommendation model returned no structured result.");
    }
    return {
      recommendation: ComposedRecommendationSchema.parse(response.output_parsed),
      usage: usageOf(response),
      modelCalls: 1,
      responseId: responseIdOf(response),
    };
  }
}

import type {
  ComposedRecommendation,
  Intent,
  LiveProvider,
  MenuItemObservation,
  PreferenceWeights,
  ProviderSource,
  RatingObservation,
  RecommendationRequest,
  ResearchPayload,
  SearchAction,
  SearchPlan,
  SourceRecordInput,
  Usage,
} from "./schemas";

export type ResearchPhase = "broad" | "deep";
export type ConfidenceBand = "high" | "medium" | "low";
export type TraceStage =
  | "request"
  | "intent"
  | "planning"
  | "broad_research"
  | "grounding"
  | "resolution"
  | "preliminary_ranking"
  | "deep_research"
  | "final_ranking"
  | "recommendation"
  | "complete";

export type TraceStatus = "started" | "completed" | "warning" | "failed";

export type TraceEvent = {
  id: string;
  stage: TraceStage;
  status: TraceStatus;
  at: string;
  durationMs: number | null;
  summary: string;
  details: Record<string, unknown>;
};

export type SourceRecord = SourceRecordInput & {
  recordId: string;
  sourceId: string;
  retrievedAt: string;
};

export type EvidenceKind =
  | "identity"
  | "address"
  | "rating"
  | "platform_presence"
  | "delivery"
  | "menu_item"
  | "price"
  | "proximity";

export type EvidenceClaim = {
  evidenceId: string;
  entityId: string;
  recordId: string;
  sourceId: string;
  kind: EvidenceKind;
  label: string;
  value: string;
};

export type ProviderResearchRun = {
  phase: ResearchPhase;
  payload: ResearchPayload;
  observedSources: ProviderSource[];
  actions: SearchAction[];
  usage: Usage;
  modelCalls: number;
  responseId: string | null;
};

export type GroundedResearchRun = ProviderResearchRun & {
  acceptedRecords: SourceRecord[];
  rejectedRecords: Array<{
    record: SourceRecordInput;
    reason: string;
  }>;
};

export type IdentityMatch = {
  leftRecordId: string;
  rightRecordId: string;
  decision: "merge" | "uncertain" | "separate";
  confidence: ConfidenceBand;
  signals: string[];
};

export type ResolvedRestaurant = {
  entityId: string;
  displayName: string;
  branch: string | null;
  address: string | null;
  postalCode: string | null;
  neighborhood: string | null;
  recordIds: string[];
  sourceIds: string[];
  records: SourceRecord[];
  identityConfidence: ConfidenceBand;
  evidenceConfidence: ConfidenceBand;
  conflicts: string[];
};

export type ResolutionResult = {
  restaurants: ResolvedRestaurant[];
  matches: IdentityMatch[];
};

export type ComponentKey = keyof PreferenceWeights;

export type ComponentScore = {
  key: ComponentKey;
  score: number;
  label: "strong" | "solid" | "mixed" | "limited" | "unknown";
  explanation: string;
  evidenceIds: string[];
};

export type RankedRestaurant = {
  rank: number;
  entityId: string;
  restaurant: ResolvedRestaurant;
  score: number;
  components: ComponentScore[];
  hardConstraintFailures: string[];
  warnings: string[];
  evidenceIds: string[];
};

export type RecommendedDish = {
  name: string;
  reason: string;
  evidenceIds: string[];
};

export type RecommendationOption = {
  rank: number;
  entityId: string;
  restaurantName: string;
  branch: string | null;
  verdict: string;
  fitExplanation: string;
  confidence: ConfidenceBand;
  recommendedDishes: RecommendedDish[];
  citedEvidenceIds: string[];
  uncertainties: string[];
  componentScores: ComponentScore[];
};

export type DecisionMetrics = {
  latencyMs: number;
  modelCalls: number;
  searchActions: number;
  sourceCount: number;
  acceptedRecordCount: number;
  rejectedRecordCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type DecisionPacket = {
  decisionId: string;
  generatedAt: string;
  provider: ProviderDescriptor;
  request: RecommendationRequest;
  intent: Intent;
  searchPlans: SearchPlan[];
  decisionSummary: string;
  recommendations: RecommendationOption[];
  restaurants: ResolvedRestaurant[];
  evidence: EvidenceClaim[];
  sources: Array<ProviderSource & { sourceId: string }>;
  identityMatches: IdentityMatch[];
  warnings: string[];
  trace: TraceEvent[];
  metrics: DecisionMetrics;
};

export type IntentResult = {
  intent: Intent;
  usage: Usage;
  modelCalls: number;
  responseId: string | null;
};

export type CompositionResult = {
  recommendation: ComposedRecommendation;
  usage: Usage;
  modelCalls: number;
  responseId: string | null;
};

export type ProviderDescriptor = {
  kind: LiveProvider | "fixture";
  model: string;
};

export type ProviderPublicState = {
  configured: boolean;
  provider: ProviderDescriptor["kind"] | null;
  model: string | null;
  source: "session" | "environment" | "fixture" | null;
  expiresAt: string | null;
  sessionOnly: boolean;
};

export type SearchProviderInput = {
  phase: ResearchPhase;
  intent: Intent;
  plan: SearchPlan;
  finalists: ResolvedRestaurant[];
};

export interface IntentModel {
  interpret(
    request: RecommendationRequest,
    signal?: AbortSignal,
  ): Promise<IntentResult>;

  compose(
    input: {
      request: RecommendationRequest;
      intent: Intent;
      ranked: RankedRestaurant[];
      evidence: EvidenceClaim[];
    },
    signal?: AbortSignal,
  ): Promise<CompositionResult>;
}

export interface SearchProvider {
  research(
    input: SearchProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderResearchRun>;
}

export type FoodLensDependencies = {
  intentModel: IntentModel;
  searchProvider: SearchProvider;
  provider: ProviderDescriptor;
};

export type PipelineOptions = {
  signal?: AbortSignal;
  onTrace?: (event: TraceEvent) => void | Promise<void>;
};

export type RawMenuCandidate = MenuItemObservation & {
  recordId: string;
  sourceId: string;
};

export type RawRatingCandidate = RatingObservation & {
  recordId: string;
  sourceId: string;
  platform: SourceRecord["platform"];
};

import { z } from "zod";

export const RecommendationRequestSchema = z
  .object({
    location: z.string().trim().min(2).max(160),
    query: z.string().trim().min(8).max(2_000),
  })
  .strict();

export const LiveProviderSchema = z.enum(["openrouter", "openai"]);

export const ProviderSetupSchema = z
  .object({
    provider: LiveProviderSchema,
    apiKey: z.string().trim().min(12).max(512),
    model: z
      .string()
      .trim()
      .min(2)
      .max(180)
      .regex(/^[a-zA-Z0-9._~:/-]+$/, "Model ID contains unsupported characters."),
  })
  .strict();

export const PreferenceWeightsSchema = z
  .object({
    reputation: z.number().min(0).max(1),
    evidence: z.number().min(0).max(1),
    menu: z.number().min(0).max(1),
    delivery: z.number().min(0).max(1),
    price: z.number().min(0).max(1),
    location: z.number().min(0).max(1),
  })
  .strict();

export const IntentSchema = z
  .object({
    location: z.string(),
    cuisine: z.string().nullable(),
    desiredDishes: z.array(z.string()).max(12),
    flavorPreferences: z.array(z.string()).max(12),
    budgetSgdMax: z.number().positive().nullable(),
    budgetBasis: z.enum(["per_person", "whole_order", "unknown"]),
    partySize: z.number().int().positive().max(30).nullable(),
    deliveryRequired: z.boolean(),
    deliveryTimePreference: z.string().nullable(),
    hardConstraints: z.array(z.string()).max(12),
    softPreferences: z.array(z.string()).max(20),
    weights: PreferenceWeightsSchema,
    interpretationWarnings: z.array(z.string()).max(12),
  })
  .strict();

export const SearchQuerySchema = z
  .object({
    id: z.string(),
    purpose: z.enum([
      "candidate_discovery",
      "google_reputation",
      "foodpanda_presence",
      "menu_and_dishes",
      "price_and_delivery",
      "finalist_verification",
    ]),
    query: z.string(),
    targetRestaurant: z.string().nullable(),
  })
  .strict();

export const SearchPlanSchema = z
  .object({
    phase: z.enum(["broad", "deep"]),
    queries: z.array(SearchQuerySchema).max(18),
    objectives: z.array(z.string()).max(12),
  })
  .strict();

export const RatingObservationSchema = z
  .object({
    value: z.number().min(0).max(5),
    scale: z.literal(5),
    reviewCount: z.number().int().nonnegative().nullable(),
    rawReviewCount: z.string().nullable(),
  })
  .strict();

export const MenuItemObservationSchema = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    priceSgd: z.number().nonnegative().nullable(),
    priceText: z.string().nullable(),
    desiredDishMatch: z.boolean(),
    flavorTags: z.array(z.string()).max(10),
  })
  .strict();

export const PriceSignalSchema = z
  .object({
    label: z.string(),
    amountSgd: z.number().nonnegative().nullable(),
    priceText: z.string(),
  })
  .strict();

export const SourceRecordInputSchema = z
  .object({
    restaurantName: z.string(),
    branch: z.string().nullable(),
    address: z.string().nullable(),
    postalCode: z.string().nullable(),
    neighborhood: z.string().nullable(),
    phone: z.string().nullable(),
    cuisine: z.array(z.string()).max(10),
    sourceTitle: z.string(),
    sourceUrl: z.string().url(),
    sourceKind: z.enum([
      "foodpanda",
      "google_maps",
      "google_aggregate",
      "restaurant_official",
      "menu_aggregate",
      "review_aggregate",
      "other",
    ]),
    platform: z.enum(["foodpanda", "google", "restaurant", "other"]),
    rating: RatingObservationSchema.nullable(),
    platformPresence: z.enum(["listing_found", "not_found", "unknown"]),
    deliveryState: z.enum([
      "unknown",
      "listing_found",
      "appears_open",
      "accepting_orders",
      "exact_address_eligible",
      "eta_known",
      "unavailable",
    ]),
    deliveryNote: z.string().nullable(),
    menuItems: z.array(MenuItemObservationSchema).max(35),
    priceSignals: z.array(PriceSignalSchema).max(12),
    distanceKm: z.number().nonnegative().nullable(),
    proximityText: z.string().nullable(),
    notes: z.array(z.string()).max(12),
  })
  .strict();

export const ResearchPayloadSchema = z
  .object({
    records: z.array(SourceRecordInputSchema).max(45),
    warnings: z.array(z.string()).max(20),
  })
  .strict();

export const ProviderSourceSchema = z
  .object({
    url: z.string().url(),
    title: z.string(),
  })
  .strict();

export const SearchActionSchema = z
  .object({
    type: z.enum(["search", "open_page", "find_in_page", "unknown"]),
    query: z.string().nullable(),
    url: z.string().url().nullable(),
  })
  .strict();

export const UsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strict();

export const ComposedOptionSchema = z
  .object({
    entityId: z.string(),
    verdict: z.string().max(180),
    fitExplanation: z.string().max(700),
    recommendedDishes: z
      .array(
        z
          .object({
            name: z.string(),
            reason: z.string().max(300),
            evidenceIds: z.array(z.string()).max(8),
          })
          .strict(),
      )
      .max(5),
    citedEvidenceIds: z.array(z.string()).max(30),
    uncertainties: z.array(z.string()).max(12),
  })
  .strict();

export const ComposedRecommendationSchema = z
  .object({
    decisionSummary: z.string().max(500),
    options: z.array(ComposedOptionSchema).max(5),
    globalWarnings: z.array(z.string()).max(15),
  })
  .strict();

export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;
export type LiveProvider = z.infer<typeof LiveProviderSchema>;
export type ProviderSetup = z.infer<typeof ProviderSetupSchema>;
export type PreferenceWeights = z.infer<typeof PreferenceWeightsSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchPlan = z.infer<typeof SearchPlanSchema>;
export type RatingObservation = z.infer<typeof RatingObservationSchema>;
export type MenuItemObservation = z.infer<typeof MenuItemObservationSchema>;
export type PriceSignal = z.infer<typeof PriceSignalSchema>;
export type SourceRecordInput = z.infer<typeof SourceRecordInputSchema>;
export type ResearchPayload = z.infer<typeof ResearchPayloadSchema>;
export type ProviderSource = z.infer<typeof ProviderSourceSchema>;
export type SearchAction = z.infer<typeof SearchActionSchema>;
export type Usage = z.infer<typeof UsageSchema>;
export type ComposedRecommendation = z.infer<
  typeof ComposedRecommendationSchema
>;

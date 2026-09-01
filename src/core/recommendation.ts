import type { ComposedRecommendation, Intent } from "../shared/schemas";
import type {
  EvidenceClaim,
  RankedRestaurant,
  RecommendationOption,
} from "../shared/types";
import { nameSimilarity, normalizeText } from "./normalize";

type FinalizedRecommendation = {
  decisionSummary: string;
  options: RecommendationOption[];
  warnings: string[];
};

function evidenceForEntity(
  evidence: EvidenceClaim[],
  entityId: string,
): EvidenceClaim[] {
  return evidence.filter((claim) => claim.entityId === entityId);
}

function fallbackDishes(
  item: RankedRestaurant,
  evidence: EvidenceClaim[],
  intent: Intent,
): RecommendationOption["recommendedDishes"] {
  const menu = evidenceForEntity(evidence, item.entityId).filter(
    (claim) => claim.kind === "menu_item",
  );
  return menu
    .map((claim) => {
      const name = claim.value.split(" | ")[0]?.trim() || claim.value;
      const desired = Math.max(
        0,
        ...intent.desiredDishes.map((dish) => nameSimilarity(name, dish)),
      );
      const flavor = intent.flavorPreferences.some((preference) =>
        normalizeText(claim.value).includes(normalizeText(preference)),
      );
      return { claim, name, priority: desired * 2 + (flavor ? 0.5 : 0) };
    })
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3)
    .map(({ claim, name }) => ({
      name,
      reason:
        intent.desiredDishes.some((dish) => nameSimilarity(name, dish) >= 0.62)
          ? "This matches a dish you explicitly requested."
          : "This grounded menu item best matches the available preference evidence.",
      evidenceIds: [claim.evidenceId],
    }));
}

function fallbackOption(
  item: RankedRestaurant,
  evidence: EvidenceClaim[],
  intent: Intent,
): RecommendationOption {
  const strongest = [...item.components]
    .filter((component) => component.label === "strong" || component.label === "solid")
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
  const fitExplanation =
    strongest.length > 0
      ? strongest.map((component) => component.explanation).join(" ")
      : "This option ranked highest after applying the stated preferences to the available grounded evidence.";

  return {
    rank: item.rank,
    entityId: item.entityId,
    restaurantName: item.restaurant.displayName,
    branch: item.restaurant.branch,
    verdict: item.rank === 1 ? "Best overall match." : "A grounded alternative.",
    fitExplanation,
    confidence: item.restaurant.evidenceConfidence,
    recommendedDishes: fallbackDishes(item, evidence, intent),
    citedEvidenceIds: item.evidenceIds.slice(0, 14),
    uncertainties:
      item.warnings.length > 0
        ? item.warnings
        : ["Real-time delivery and exact-address eligibility were not independently confirmed."],
    componentScores: item.components,
  };
}

function dishIsGrounded(
  dishName: string,
  evidenceIds: string[],
  evidenceById: Map<string, EvidenceClaim>,
  entityId: string,
): boolean {
  const cited = evidenceIds
    .map((id) => evidenceById.get(id))
    .filter(
      (claim): claim is EvidenceClaim =>
        Boolean(claim && claim.entityId === entityId && claim.kind === "menu_item"),
    );
  return cited.some((claim) => {
    const observedName = claim.value.split(" | ")[0] ?? claim.value;
    return (
      normalizeText(claim.value).includes(normalizeText(dishName)) ||
      nameSimilarity(observedName, dishName) >= 0.62
    );
  });
}

export function finalizeRecommendation(
  ranked: RankedRestaurant[],
  evidence: EvidenceClaim[],
  intent: Intent,
  composed?: ComposedRecommendation,
): FinalizedRecommendation {
  if (ranked.length === 0) {
    return {
      decisionSummary:
        "No grounded restaurant decision could be made from the retrieved public evidence.",
      options: [],
      warnings: ["No grounded candidates were available after source validation."],
    };
  }

  const top = ranked.slice(0, 3);
  const evidenceById = new Map(evidence.map((claim) => [claim.evidenceId, claim]));
  const composedByEntity = new Map(
    (composed?.options ?? []).map((option) => [option.entityId, option]),
  );
  const warnings: string[] = [];

  const options = top.map((item) => {
    const candidate = composedByEntity.get(item.entityId);
    if (!candidate) {
      if (composed) {
        warnings.push(
          `The generated explanation omitted ${item.restaurant.displayName}; deterministic copy was used.`,
        );
      }
      return fallbackOption(item, evidence, intent);
    }

    const validCitations = candidate.citedEvidenceIds.filter((id) => {
      const claim = evidenceById.get(id);
      return claim?.entityId === item.entityId;
    });
    const recommendedDishes = candidate.recommendedDishes.filter((dish) => {
      const grounded = dishIsGrounded(
        dish.name,
        dish.evidenceIds,
        evidenceById,
        item.entityId,
      );
      if (!grounded) {
        warnings.push(
          `Discarded an ungrounded dish recommendation for ${item.restaurant.displayName}: ${dish.name}.`,
        );
      }
      return grounded;
    });

    if (validCitations.length === 0) {
      warnings.push(
        `The generated explanation for ${item.restaurant.displayName} had no valid evidence IDs; deterministic copy was used.`,
      );
      return fallbackOption(item, evidence, intent);
    }

    return {
      rank: item.rank,
      entityId: item.entityId,
      restaurantName: item.restaurant.displayName,
      branch: item.restaurant.branch,
      verdict: candidate.verdict,
      fitExplanation: candidate.fitExplanation,
      confidence: item.restaurant.evidenceConfidence,
      recommendedDishes:
        recommendedDishes.length > 0
          ? recommendedDishes
          : fallbackDishes(item, evidence, intent),
      citedEvidenceIds: validCitations,
      uncertainties: [...new Set([...candidate.uncertainties, ...item.warnings])],
      componentScores: item.components,
    } satisfies RecommendationOption;
  });

  return {
    decisionSummary:
      composed?.decisionSummary ||
      `${options[0].restaurantName} is the best supported match for this request.`,
    options,
    warnings: [...new Set([...(composed?.globalWarnings ?? []), ...warnings])],
  };
}

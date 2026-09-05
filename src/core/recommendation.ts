import { hasHardBudget } from "./constraints";
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
  const hardBudget = hasHardBudget(intent);
  return menu
    .filter(claim => !hardBudget || item.restaurant.records.some(record =>
      record.menuItems.some(dish => normalizeText(dish.name) === normalizeText(claim.value.split(" | ")[0] ?? "") &&
        dish.priceSgd !== null && dish.priceSgd <= intent.budgetSgdMax!)))
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
          : "This menu item was observed in the cited source; check the current menu and price.",
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

// Generated prose cannot be validated by citation membership alone. Public copy
// is rendered from deterministic fields; the legacy composer argument is ignored.
export function finalizeRecommendation(
  ranked: RankedRestaurant[],
  evidence: EvidenceClaim[],
  intent: Intent,
  composed?: ComposedRecommendation,
): FinalizedRecommendation {
  const eligible = ranked.filter(item => item.hardConstraintFailures.length === 0);
  const warnings = ranked.flatMap(item => item.hardConstraintFailures.map(
    reason => `${item.restaurant.displayName}: ${reason}`,
  ));
  if (composed) warnings.push("Generated recommendation prose was discarded; verified field templates were used.");
  const options = eligible.slice(0, 3).map((item, index) =>
    fallbackOption({ ...item, rank: index + 1 }, evidence, intent),
  );
  return {
    decisionSummary: options.length > 0
      ? `${options[0].restaurantName} is the best supported match among the eligible candidates.`
      : "No verified option meets the hard constraints. Check the missing evidence or explicitly relax your request.",
    options,
    warnings: [...new Set(warnings)],
  };
}

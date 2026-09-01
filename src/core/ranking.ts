import type { Intent, PreferenceWeights } from "../shared/schemas";
import type {
  ComponentKey,
  ComponentScore,
  EvidenceClaim,
  RankedRestaurant,
  ResolvedRestaurant,
  SourceRecord,
} from "../shared/types";
import { nameSimilarity, normalizeText, tokenSimilarity } from "./normalize";
import { normalizeWeights } from "./search-plan";

const DELIVERY_SCORE: Record<SourceRecord["deliveryState"], number> = {
  unknown: 35,
  listing_found: 62,
  appears_open: 72,
  accepting_orders: 88,
  exact_address_eligible: 96,
  eta_known: 100,
  unavailable: 0,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function label(score: number, known = true): ComponentScore["label"] {
  if (!known) return "unknown";
  if (score >= 82) return "strong";
  if (score >= 65) return "solid";
  if (score >= 45) return "mixed";
  return "limited";
}

function evidenceFor(
  claims: EvidenceClaim[],
  restaurant: ResolvedRestaurant,
  kinds: EvidenceClaim["kind"][],
): string[] {
  const recordIds = new Set(restaurant.recordIds);
  return claims
    .filter((claim) => recordIds.has(claim.recordId) && kinds.includes(claim.kind))
    .map((claim) => claim.evidenceId);
}

function reputationComponent(
  restaurant: ResolvedRestaurant,
  evidence: EvidenceClaim[],
): ComponentScore {
  const ratings = restaurant.records.filter((record) => record.rating);
  if (ratings.length === 0) {
    return {
      key: "reputation",
      score: 40,
      label: "unknown",
      explanation: "No grounded rating observation was found.",
      evidenceIds: [],
    };
  }

  const strongestByPlatform = new Map<string, SourceRecord>();
  for (const record of ratings) {
    const key = record.platform === "other" ? record.sourceKind : record.platform;
    const current = strongestByPlatform.get(key);
    const count = record.rating?.reviewCount ?? 0;
    const currentCount = current?.rating?.reviewCount ?? 0;
    if (!current || count > currentCount) strongestByPlatform.set(key, record);
  }

  const scores = [...strongestByPlatform.values()].map((record) => {
    const rating = record.rating!;
    const quality = clamp(((rating.value / 5 - 0.6) / 0.4) * 100);
    const reliability = Math.min(
      1,
      Math.log10((rating.reviewCount ?? 0) + 1) / 3.5,
    );
    return quality * (0.65 + 0.35 * reliability);
  });
  const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const maxReviews = Math.max(
    0,
    ...ratings.map((record) => record.rating?.reviewCount ?? 0),
  );

  return {
    key: "reputation",
    score,
    label: label(score),
    explanation: `${ratings.length} grounded rating observation${ratings.length === 1 ? "" : "s"}; largest visible sample ${maxReviews || "unknown"}.`,
    evidenceIds: evidenceFor(evidence, restaurant, ["rating"]),
  };
}

function menuComponent(
  restaurant: ResolvedRestaurant,
  intent: Intent,
  evidence: EvidenceClaim[],
): ComponentScore {
  const items = restaurant.records.flatMap((record) =>
    record.menuItems.map((item) => ({ item, record })),
  );
  const hasMenu = items.length > 0;
  if (intent.desiredDishes.length === 0 && intent.flavorPreferences.length === 0) {
    return {
      key: "menu",
      score: hasMenu ? 72 : 50,
      label: hasMenu ? "solid" : "unknown",
      explanation: hasMenu
        ? `${items.length} menu item${items.length === 1 ? " was" : "s were"} observed.`
        : "No menu preference was required and no menu was found.",
      evidenceIds: evidenceFor(evidence, restaurant, ["menu_item"]),
    };
  }

  if (!hasMenu) {
    return {
      key: "menu",
      score: 25,
      label: "unknown",
      explanation: "Desired dishes or flavors were specified, but no grounded menu was found.",
      evidenceIds: [],
    };
  }

  const desiredMatches = new Set<string>();
  const flavorMatches = new Set<string>();
  for (const { item } of items) {
    const itemText = normalizeText(
      [item.name, item.description, ...item.flavorTags].filter(Boolean).join(" "),
    );
    for (const dish of intent.desiredDishes) {
      const normalizedDish = normalizeText(dish);
      if (
        item.desiredDishMatch ||
        itemText.includes(normalizedDish) ||
        nameSimilarity(item.name, dish) >= 0.64
      ) {
        desiredMatches.add(dish);
      }
    }
    for (const flavor of intent.flavorPreferences) {
      const normalizedFlavor = normalizeText(flavor);
      if (
        itemText.includes(normalizedFlavor) ||
        tokenSimilarity(itemText, normalizedFlavor) >= 0.25
      ) {
        flavorMatches.add(flavor);
      }
    }
  }

  const dishScore =
    intent.desiredDishes.length === 0
      ? 70
      : 20 + 80 * (desiredMatches.size / intent.desiredDishes.length);
  const flavorScore =
    intent.flavorPreferences.length === 0
      ? 70
      : 35 + 65 * (flavorMatches.size / intent.flavorPreferences.length);
  const score =
    intent.desiredDishes.length > 0 && intent.flavorPreferences.length > 0
      ? dishScore * 0.7 + flavorScore * 0.3
      : intent.desiredDishes.length > 0
        ? dishScore
        : flavorScore;

  return {
    key: "menu",
    score,
    label: label(score),
    explanation: `${desiredMatches.size}/${intent.desiredDishes.length || 0} desired dishes and ${flavorMatches.size}/${intent.flavorPreferences.length || 0} flavor preferences matched grounded menu text.`,
    evidenceIds: evidenceFor(evidence, restaurant, ["menu_item"]),
  };
}

function deliveryComponent(
  restaurant: ResolvedRestaurant,
  intent: Intent,
  evidence: EvidenceClaim[],
): { component: ComponentScore; failure: string | null; warning: string | null } {
  const states = restaurant.records.map((record) => record.deliveryState);
  const hasListing = restaurant.records.some(
    (record) =>
      record.platform === "foodpanda" && record.platformPresence === "listing_found",
  );
  const bestStateScore = Math.max(
    hasListing ? DELIVERY_SCORE.listing_found : DELIVERY_SCORE.unknown,
    ...states.map((state) => DELIVERY_SCORE[state]),
  );
  const known = hasListing || states.some((state) => state !== "unknown");
  const failure =
    intent.deliveryRequired && states.every((state) => state === "unavailable")
      ? "Grounded evidence says delivery is unavailable."
      : null;
  const warning =
    intent.deliveryRequired && bestStateScore < DELIVERY_SCORE.listing_found
      ? "Delivery was required, but no delivery-platform listing was grounded."
      : intent.deliveryRequired && bestStateScore < DELIVERY_SCORE.exact_address_eligible
        ? "A listing was found, but exact-address delivery eligibility remains unverified."
        : null;

  return {
    component: {
      key: "delivery",
      score: bestStateScore,
      label: label(bestStateScore, known),
      explanation: known
        ? "The score reflects only the strongest observable delivery state, not inferred eligibility."
        : "No grounded delivery signal was found.",
      evidenceIds: evidenceFor(evidence, restaurant, [
        "platform_presence",
        "delivery",
      ]),
    },
    failure,
    warning,
  };
}

function priceComponent(
  restaurant: ResolvedRestaurant,
  intent: Intent,
  evidence: EvidenceClaim[],
): { component: ComponentScore; failure: string | null; warning: string | null } {
  const prices = restaurant.records.flatMap((record) => {
    const menuPrices = record.menuItems.flatMap((item) => {
      if (item.priceSgd === null) return [];
      if (intent.desiredDishes.length === 0) return [item.priceSgd];
      const relevant =
        item.desiredDishMatch ||
        intent.desiredDishes.some((dish) => nameSimilarity(item.name, dish) >= 0.62);
      return relevant ? [item.priceSgd] : [];
    });
    const comparableSignals = record.priceSignals.flatMap((signal) => {
      if (signal.amountSgd === null) return [];
      if (/minimum order|delivery fee|service fee/i.test(signal.label)) return [];
      return /price|per person|meal|dish|set|range/i.test(signal.label)
        ? [signal.amountSgd]
        : [];
    });
    return [...menuPrices, ...comparableSignals];
  });
  const budget = intent.budgetSgdMax;
  if (budget === null) {
    return {
      component: {
        key: "price",
        score: prices.length > 0 ? 72 : 52,
        label: prices.length > 0 ? "solid" : "unknown",
        explanation:
          prices.length > 0
            ? `${prices.length} observable price point${prices.length === 1 ? "" : "s"} found; no budget cap was specified.`
            : "No budget cap or grounded price was available.",
        evidenceIds: evidenceFor(evidence, restaurant, ["menu_item", "price"]),
      },
      failure: null,
      warning: null,
    };
  }

  if (prices.length === 0) {
    return {
      component: {
        key: "price",
        score: 42,
        label: "unknown",
        explanation: `No grounded price could be checked against the S$${budget} budget.`,
        evidenceIds: [],
      },
      failure: null,
      warning: "Budget fit remains unknown because no grounded prices were found.",
    };
  }

  const affordable = prices.filter((price) => price <= budget);
  const minimum = Math.min(...prices);
  const score = affordable.length > 0 ? 95 : clamp(70 - ((minimum - budget) / budget) * 100);
  const budgetIsHard = intent.hardConstraints.some((constraint) =>
    /budget|price|cost|under|below/i.test(constraint),
  );
  const failure =
    budgetIsHard && affordable.length === 0
      ? `No observed price was within the S$${budget} hard budget.`
      : null;

  return {
    component: {
      key: "price",
      score,
      label: label(score),
      explanation: `${affordable.length}/${prices.length} observed prices are at or below S$${budget}; lowest observed price S$${minimum.toFixed(2)}.`,
      evidenceIds: evidenceFor(evidence, restaurant, ["menu_item", "price"]),
    },
    failure,
    warning: null,
  };
}

function locationComponent(
  restaurant: ResolvedRestaurant,
  intent: Intent,
  evidence: EvidenceClaim[],
): ComponentScore {
  const distances = restaurant.records
    .map((record) => record.distanceKm)
    .filter((value): value is number => value !== null);
  if (distances.length > 0) {
    const distance = Math.min(...distances);
    const score = clamp(100 - distance * 14);
    return {
      key: "location",
      score,
      label: label(score),
      explanation: `Nearest grounded distance signal is ${distance.toFixed(1)} km.`,
      evidenceIds: evidenceFor(evidence, restaurant, ["proximity"]),
    };
  }

  const target = normalizeText(intent.location.replace(/singapore/gi, ""));
  const locationText = normalizeText(
    [restaurant.address, restaurant.neighborhood, restaurant.branch]
      .filter(Boolean)
      .join(" "),
  );
  const directMatch = Boolean(target && locationText.includes(target));
  return {
    key: "location",
    score: directMatch ? 90 : 52,
    label: directMatch ? "strong" : "unknown",
    explanation: directMatch
      ? "The branch address or neighborhood matches the requested area."
      : "No distance was available; proximity remains uncertain.",
    evidenceIds: evidenceFor(evidence, restaurant, ["address", "proximity"]),
  };
}

function evidenceComponent(
  restaurant: ResolvedRestaurant,
  evidence: EvidenceClaim[],
): ComponentScore {
  const score =
    restaurant.evidenceConfidence === "high"
      ? 95
      : restaurant.evidenceConfidence === "medium"
        ? 70
        : 38;
  return {
    key: "evidence",
    score,
    label: label(score),
    explanation: `${restaurant.sourceIds.length} grounded source${restaurant.sourceIds.length === 1 ? "" : "s"}, ${restaurant.identityConfidence} identity confidence, ${restaurant.conflicts.length} material conflict${restaurant.conflicts.length === 1 ? "" : "s"}.`,
    evidenceIds: evidenceFor(evidence, restaurant, [
      "identity",
      "address",
      "rating",
      "platform_presence",
    ]),
  };
}

function componentMap(components: ComponentScore[]): Map<ComponentKey, ComponentScore> {
  return new Map(components.map((component) => [component.key, component]));
}

export function rankRestaurants(
  restaurants: ResolvedRestaurant[],
  intent: Intent,
  evidence: EvidenceClaim[],
): RankedRestaurant[] {
  const weights = normalizeWeights(intent.weights);
  const ranked = restaurants.map((restaurant) => {
    const delivery = deliveryComponent(restaurant, intent, evidence);
    const price = priceComponent(restaurant, intent, evidence);
    const components = [
      reputationComponent(restaurant, evidence),
      evidenceComponent(restaurant, evidence),
      menuComponent(restaurant, intent, evidence),
      delivery.component,
      price.component,
      locationComponent(restaurant, intent, evidence),
    ];
    const byKey = componentMap(components);
    const hardConstraintFailures = [delivery.failure, price.failure].filter(
      (value): value is string => Boolean(value),
    );
    const warnings = [
      ...restaurant.conflicts,
      delivery.warning,
      price.warning,
    ].filter((value): value is string => Boolean(value));
    const weightedScore = (
      Object.entries(weights) as Array<[ComponentKey, number]>
    ).reduce(
      (sum, [key, weight]) => sum + (byKey.get(key)?.score ?? 0) * weight,
      0,
    );
    const score = clamp(weightedScore - hardConstraintFailures.length * 20);

    return {
      rank: 0,
      entityId: restaurant.entityId,
      restaurant,
      score: Math.round(score),
      components,
      hardConstraintFailures,
      warnings,
      evidenceIds: [...new Set(components.flatMap((component) => component.evidenceIds))],
    } satisfies RankedRestaurant;
  });

  return ranked
    .sort(
      (left, right) =>
        left.hardConstraintFailures.length - right.hardConstraintFailures.length ||
        right.score - left.score ||
        right.restaurant.sourceIds.length - left.restaurant.sourceIds.length ||
        left.restaurant.displayName.localeCompare(right.restaurant.displayName),
    )
    .map((restaurant, index) => ({ ...restaurant, rank: index + 1 }));
}

import type { Intent, PreferenceWeights, SearchPlan } from "../shared/schemas";
import type { ResolvedRestaurant } from "../shared/types";

export function normalizeWeights(weights: PreferenceWeights): PreferenceWeights {
  const entries = Object.entries(weights) as Array<
    [keyof PreferenceWeights, number]
  >;
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0);
  if (total === 0) {
    return {
      reputation: 1 / 6,
      evidence: 1 / 6,
      menu: 1 / 6,
      delivery: 1 / 6,
      price: 1 / 6,
      location: 1 / 6,
    };
  }

  return Object.fromEntries(
    entries.map(([key, value]) => [key, Math.max(0, value) / total]),
  ) as PreferenceWeights;
}

export function normalizeIntent(intent: Intent): Intent {
  return {
    ...intent,
    location: intent.location.trim(),
    desiredDishes: [...new Set(intent.desiredDishes.map((item) => item.trim()))].filter(
      Boolean,
    ),
    flavorPreferences: [
      ...new Set(intent.flavorPreferences.map((item) => item.trim())),
    ].filter(Boolean),
    weights: normalizeWeights(intent.weights),
  };
}

function phrase(value: string | null, fallback: string): string {
  return value?.trim() || fallback;
}

export function buildBroadSearchPlan(intent: Intent): SearchPlan {
  const cuisine = phrase(intent.cuisine, "restaurants");
  const location = intent.location;
  const dishes = intent.desiredDishes.join(" or ");

  const queries: SearchPlan["queries"] = [
    {
      id: "discover",
      purpose: "candidate_discovery",
      query: `${cuisine} restaurants near ${location}, Singapore`,
      targetRestaurant: null,
    },
    {
      id: "google",
      purpose: "google_reputation",
      query: `${cuisine} ${location} Singapore Google rating reviews`,
      targetRestaurant: null,
    },
    {
      id: "foodpanda",
      purpose: "foodpanda_presence",
      query: `site:foodpanda.sg ${cuisine} ${location} Singapore`,
      targetRestaurant: null,
    },
    {
      id: "menu",
      purpose: "menu_and_dishes",
      query: dishes
        ? `site:foodpanda.sg ${dishes} ${location} Singapore`
        : `${cuisine} menu ${location} Singapore`,
      targetRestaurant: null,
    },
    {
      id: "price-delivery",
      purpose: "price_and_delivery",
      query: `${cuisine} delivery menu prices ${location} Singapore`,
      targetRestaurant: null,
    },
  ];

  return {
    phase: "broad",
    queries,
    objectives: [
      "Discover a broad branch-level candidate set before ranking.",
      "Find independent Google-related and Foodpanda-related evidence when indexed.",
      "Find desired dishes, menu prices, and delivery signals without inferring exact-address eligibility.",
    ],
  };
}

export function buildDeepSearchPlan(
  intent: Intent,
  finalists: ResolvedRestaurant[],
): SearchPlan {
  const queries: SearchPlan["queries"] = [];
  for (const finalist of finalists.slice(0, 3)) {
    const branch = finalist.branch ? ` ${finalist.branch}` : "";
    const location = finalist.postalCode || finalist.address || intent.location;
    queries.push(
      {
        id: `verify-${finalist.entityId}`,
        purpose: "finalist_verification",
        query: `"${finalist.displayName}"${branch} ${location} Google rating reviews`,
        targetRestaurant: finalist.displayName,
      },
      {
        id: `menu-${finalist.entityId}`,
        purpose: "menu_and_dishes",
        query: `site:foodpanda.sg "${finalist.displayName}"${branch} menu rating`,
        targetRestaurant: finalist.displayName,
      },
    );
  }

  return {
    phase: "deep",
    queries,
    objectives: [
      "Verify branch identity and conflicting location signals for finalists.",
      "Confirm Foodpanda listing, rating, menu, desired dishes, and observable prices.",
      "Look for an independent reputation source and expose unresolved conflicts.",
    ],
  };
}

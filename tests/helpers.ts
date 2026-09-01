import type { Intent, SourceRecordInput } from "../src/shared/schemas";
import { groundedRecord } from "../src/core/grounding";

export function testRecord(
  override: Partial<SourceRecordInput> &
    Pick<SourceRecordInput, "restaurantName" | "sourceUrl">,
) {
  const { restaurantName, sourceUrl, ...rest } = override;
  const input: SourceRecordInput = {
    restaurantName,
    branch: null,
    address: null,
    postalCode: null,
    neighborhood: null,
    phone: null,
    cuisine: ["Thai"],
    sourceTitle: restaurantName,
    sourceUrl,
    sourceKind: "other",
    platform: "other",
    rating: null,
    platformPresence: "unknown",
    deliveryState: "unknown",
    deliveryNote: null,
    menuItems: [],
    priceSignals: [],
    distanceKm: null,
    proximityText: null,
    notes: [],
    ...rest,
  };
  return groundedRecord(input, "2026-09-01T00:00:00.000Z");
}

export function testIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    location: "Pasir Panjang, Singapore",
    cuisine: "Thai",
    desiredDishes: [],
    flavorPreferences: [],
    budgetSgdMax: null,
    budgetBasis: "unknown",
    partySize: null,
    deliveryRequired: false,
    deliveryTimePreference: null,
    hardConstraints: [],
    softPreferences: [],
    weights: {
      reputation: 1,
      evidence: 0,
      menu: 0,
      delivery: 0,
      price: 0,
      location: 0,
    },
    interpretationWarnings: [],
    ...overrides,
  };
}

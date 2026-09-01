import type {
  EvidenceClaim,
  EvidenceKind,
  ResolvedRestaurant,
  SourceRecord,
} from "../shared/types";
import { stableId } from "./id";

function claim(
  entityId: string,
  record: SourceRecord,
  kind: EvidenceKind,
  label: string,
  value: string,
  index = 0,
): EvidenceClaim {
  return {
    evidenceId: stableId(
      "ev",
      [entityId, record.recordId, kind, label, value, index].join("|"),
    ),
    entityId,
    recordId: record.recordId,
    sourceId: record.sourceId,
    kind,
    label,
    value,
  };
}

function money(value: number): string {
  return `S$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

export function buildEvidence(restaurants: ResolvedRestaurant[]): EvidenceClaim[] {
  const evidence: EvidenceClaim[] = [];

  for (const restaurant of restaurants) {
    for (const record of restaurant.records) {
      evidence.push(
        claim(
          restaurant.entityId,
          record,
          "identity",
          "Restaurant listing",
          [record.restaurantName, record.branch].filter(Boolean).join(" - "),
        ),
      );

      if (record.address || record.postalCode) {
        evidence.push(
          claim(
            restaurant.entityId,
            record,
            "address",
            "Branch address",
            [record.address, record.postalCode].filter(Boolean).join(" "),
          ),
        );
      }

      if (record.rating) {
        const count = record.rating.rawReviewCount ?? record.rating.reviewCount;
        evidence.push(
          claim(
            restaurant.entityId,
            record,
            "rating",
            `${record.platform === "other" ? record.sourceKind : record.platform} rating`,
            `${record.rating.value.toFixed(1)}/5${count !== null ? ` from ${count} reviews` : ""}`,
          ),
        );
      }

      if (record.platformPresence === "listing_found") {
        evidence.push(
          claim(
            restaurant.entityId,
            record,
            "platform_presence",
            "Platform presence",
            `A ${record.platform} listing was found.`,
          ),
        );
      }

      if (record.deliveryState !== "unknown") {
        evidence.push(
          claim(
            restaurant.entityId,
            record,
            "delivery",
            "Delivery signal",
            record.deliveryNote || record.deliveryState.replaceAll("_", " "),
          ),
        );
      }

      for (const [index, item] of record.menuItems.entries()) {
        const price =
          item.priceText || (item.priceSgd !== null ? money(item.priceSgd) : null);
        evidence.push(
          claim(
            restaurant.entityId,
            record,
            "menu_item",
            "Menu item",
            [item.name, price, item.description].filter(Boolean).join(" | "),
            index,
          ),
        );
      }

      for (const [index, signal] of record.priceSignals.entries()) {
        evidence.push(
          claim(
            restaurant.entityId,
            record,
            "price",
            signal.label,
            signal.priceText ||
              (signal.amountSgd !== null ? money(signal.amountSgd) : "Unknown"),
            index,
          ),
        );
      }

      if (record.distanceKm !== null || record.proximityText) {
        evidence.push(
          claim(
            restaurant.entityId,
            record,
            "proximity",
            "Location signal",
            record.proximityText || `${record.distanceKm?.toFixed(1)} km away`,
          ),
        );
      }
    }
  }

  return evidence;
}

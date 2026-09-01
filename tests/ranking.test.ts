import { describe, expect, it } from "vitest";
import { buildEvidence } from "../src/core/evidence";
import { rankRestaurants } from "../src/core/ranking";
import { resolveRestaurants } from "../src/core/resolution";
import { testIntent, testRecord } from "./helpers";

describe("preference-aware ranking", () => {
  it("lets a large review sample outweigh a tiny rating difference", () => {
    const tinySample = testRecord({
      restaurantName: "Tiny Sample Thai",
      sourceUrl: "https://ratings.example/tiny",
      rating: { value: 4.9, scale: 5, reviewCount: 30, rawReviewCount: "30" },
      platform: "google",
      sourceKind: "google_aggregate",
    });
    const largeSample = testRecord({
      restaurantName: "Large Sample Thai",
      sourceUrl: "https://ratings.example/large",
      rating: {
        value: 4.7,
        scale: 5,
        reviewCount: 3000,
        rawReviewCount: "3,000",
      },
      platform: "google",
      sourceKind: "google_aggregate",
    });
    const resolution = resolveRestaurants([tinySample, largeSample]);
    const evidence = buildEvidence(resolution.restaurants);
    const ranking = rankRestaurants(resolution.restaurants, testIntent(), evidence);

    expect(ranking[0].restaurant.displayName).toBe("Large Sample Thai");
  });

  it("changes the winner when the user's menu priority changes", () => {
    const reputationLeader = testRecord({
      restaurantName: "Reputation Thai",
      address: "1 Pasir Panjang Road Singapore 118000",
      neighborhood: "Pasir Panjang",
      sourceUrl: "https://food.example/reputation",
      rating: {
        value: 4.9,
        scale: 5,
        reviewCount: 1000,
        rawReviewCount: "1,000",
      },
      platform: "foodpanda",
      sourceKind: "foodpanda",
      platformPresence: "listing_found",
      deliveryState: "listing_found",
    });
    const dishLeader = testRecord({
      restaurantName: "Dish Thai",
      address: "2 Pasir Panjang Road Singapore 118001",
      neighborhood: "Pasir Panjang",
      sourceUrl: "https://food.example/dish",
      rating: {
        value: 4.3,
        scale: 5,
        reviewCount: 500,
        rawReviewCount: "500",
      },
      platform: "foodpanda",
      sourceKind: "foodpanda",
      platformPresence: "listing_found",
      deliveryState: "listing_found",
      menuItems: [
        {
          name: "Pad See Ew with Pork",
          description: "Savory wide noodles.",
          priceSgd: 14,
          priceText: "S$14",
          desiredDishMatch: true,
          flavorTags: ["savory"],
        },
      ],
    });
    const resolution = resolveRestaurants([reputationLeader, dishLeader]);
    const evidence = buildEvidence(resolution.restaurants);
    const reputationFirst = rankRestaurants(
      resolution.restaurants,
      testIntent({
        desiredDishes: ["Pad See Ew"],
        weights: {
          reputation: 1,
          evidence: 0,
          menu: 0,
          delivery: 0,
          price: 0,
          location: 0,
        },
      }),
      evidence,
    );
    const menuFirst = rankRestaurants(
      resolution.restaurants,
      testIntent({
        desiredDishes: ["Pad See Ew"],
        weights: {
          reputation: 0,
          evidence: 0,
          menu: 1,
          delivery: 0,
          price: 0,
          location: 0,
        },
      }),
      evidence,
    );

    expect(reputationFirst[0].restaurant.displayName).toBe("Reputation Thai");
    expect(menuFirst[0].restaurant.displayName).toBe("Dish Thai");
  });

  it("does not treat a minimum-order threshold as proof of dish budget fit", () => {
    const record = testRecord({
      restaurantName: "Unknown Price Thai",
      sourceUrl: "https://food.example/unknown-price",
      platform: "foodpanda",
      sourceKind: "foodpanda",
      platformPresence: "listing_found",
      deliveryState: "listing_found",
      menuItems: [
        {
          name: "Pad See Ew",
          description: null,
          priceSgd: null,
          priceText: null,
          desiredDishMatch: true,
          flavorTags: [],
        },
      ],
      priceSignals: [
        { label: "Minimum order", amountSgd: 10, priceText: "S$10 minimum order" },
      ],
    });
    const resolution = resolveRestaurants([record]);
    const evidence = buildEvidence(resolution.restaurants);
    const [ranked] = rankRestaurants(
      resolution.restaurants,
      testIntent({ desiredDishes: ["Pad See Ew"], budgetSgdMax: 30 }),
      evidence,
    );
    const price = ranked.components.find((component) => component.key === "price");

    expect(price?.label).toBe("unknown");
    expect(ranked.warnings).toContain(
      "Budget fit remains unknown because no grounded prices were found.",
    );
  });
});

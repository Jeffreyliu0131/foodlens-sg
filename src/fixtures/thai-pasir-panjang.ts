import type { Intent, SourceRecordInput } from "../shared/schemas";
import type { FixtureData } from "../providers/fixture-provider";

export const thaiPasirPanjangIntent: Intent = {
  location: "Pasir Panjang, Singapore",
  cuisine: "Thai",
  desiredDishes: ["Pad See Ew", "basil pork"],
  flavorPreferences: ["savory", "strongly flavored"],
  budgetSgdMax: 30,
  budgetBasis: "whole_order",
  partySize: null,
  deliveryRequired: true,
  deliveryTimePreference: null,
  hardConstraints: ["Delivery is required."],
  softPreferences: [
    "Around SGD 30 or below.",
    "Strong reputation across Google and Foodpanda.",
    "Review volume matters.",
  ],
  weights: {
    reputation: 0.25,
    evidence: 0.19,
    menu: 0.22,
    delivery: 0.14,
    price: 0.1,
    location: 0.1,
  },
  interpretationWarnings: [],
};

const defaults: SourceRecordInput = {
  restaurantName: "",
  branch: null,
  address: null,
  postalCode: null,
  neighborhood: null,
  phone: null,
  cuisine: ["Thai"],
  sourceTitle: "",
  sourceUrl: "https://example.com",
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
};

function record(
  override: Partial<SourceRecordInput> &
    Pick<SourceRecordInput, "restaurantName" | "sourceTitle" | "sourceUrl">,
): SourceRecordInput {
  return { ...defaults, ...override };
}

const broadRecords: SourceRecordInput[] = [
  record({
    restaurantName: "Super Thai by Soi Aroy (Pasir Panjang)",
    branch: "Pasir Panjang",
    address: "91 Pasir Panjang Road, Singapore 118512",
    postalCode: "118512",
    neighborhood: "Pasir Panjang",
    sourceTitle: "Super Thai by Soi Aroy (Pasir Panjang) Menu, Price | foodpanda",
    sourceUrl:
      "https://www.foodpanda.sg/restaurant/baci/super-thai-by-soi-aroy-pasir-panjang",
    sourceKind: "foodpanda",
    platform: "foodpanda",
    rating: {
      value: 4.8,
      scale: 5,
      reviewCount: 100,
      rawReviewCount: "100+",
    },
    platformPresence: "listing_found",
    deliveryState: "listing_found",
    deliveryNote:
      "A Foodpanda listing was found; exact-address delivery eligibility was not checked.",
    menuItems: [
      {
        name: "Pad See Ew With Pork (Hor Fun)",
        description: "Wide noodles with pork.",
        priceSgd: 15,
        priceText: "S$15 promotional price",
        desiredDishMatch: true,
        flavorTags: ["savory"],
      },
      {
        name: "Signature Basil Pork Mama",
        description: "Basil pork with noodles.",
        priceSgd: 15,
        priceText: "S$15 promotional price",
        desiredDishMatch: true,
        flavorTags: ["savory", "strongly flavored"],
      },
      {
        name: "Tom Yum Creamy",
        description: "Creamy and spicy tom yum.",
        priceSgd: 16.5,
        priceText: "S$16.50 promotional price",
        desiredDishMatch: false,
        flavorTags: ["spicy", "strongly flavored"],
      },
    ],
    priceSignals: [
      { label: "Minimum order", amountSgd: 10, priceText: "S$10 minimum order" },
    ],
  }),
  record({
    restaurantName: "Esarn Thai Corner (Pasir Panjang)",
    branch: "Pasir Panjang",
    address: "130 Pasir Panjang Road, Singapore 118548",
    postalCode: "118548",
    neighborhood: "Pasir Panjang",
    sourceTitle: "Esarn Thai Corner (Pasir Panjang) Menu, Price | foodpanda",
    sourceUrl:
      "https://www.foodpanda.sg/restaurant/v4ue/esarn-thai-corner-pasir-panjang",
    sourceKind: "foodpanda",
    platform: "foodpanda",
    rating: {
      value: 4.9,
      scale: 5,
      reviewCount: 500,
      rawReviewCount: "500+",
    },
    platformPresence: "listing_found",
    deliveryState: "listing_found",
    deliveryNote:
      "A Foodpanda listing was found; exact-address delivery eligibility was not checked.",
    menuItems: [
      {
        name: "Basil Pork",
        description: "Pork stir-fried with chili paste and basil leaves.",
        priceSgd: null,
        priceText: null,
        desiredDishMatch: true,
        flavorTags: ["savory", "strongly flavored"],
      },
      {
        name: "Pork Skewers (5pc)",
        description: "Thai-style grilled pork skewers.",
        priceSgd: 16.87,
        priceText: "S$16.87",
        desiredDishMatch: false,
        flavorTags: ["savory"],
      },
    ],
  }),
  record({
    restaurantName: "Nana Original Thai Food (Clementi Road)",
    branch: "Clementi Road",
    address: "18 Clementi Road, Singapore 129747",
    postalCode: "129747",
    neighborhood: "Clementi",
    sourceTitle: "Nana Original Thai Food (Clementi Road) Reviews | foodpanda",
    sourceUrl:
      "https://www.foodpanda.sg/restaurant/v7ts/nana-original-thai-food-clementi-road/reviews",
    sourceKind: "foodpanda",
    platform: "foodpanda",
    rating: {
      value: 4.9,
      scale: 5,
      reviewCount: 3000,
      rawReviewCount: "3000+",
    },
    platformPresence: "listing_found",
    deliveryState: "listing_found",
    deliveryNote:
      "A Foodpanda listing was found; exact-address delivery eligibility was not checked.",
    menuItems: [
      {
        name: "Pad Woon Sen",
        description: "Glass noodles with vegetables.",
        priceSgd: null,
        priceText: null,
        desiredDishMatch: false,
        flavorTags: ["savory"],
      },
    ],
  }),
  record({
    restaurantName: "Go-Ang Pratunam Chicken Rice (Anchorpoint)",
    branch: "Anchorpoint",
    address: "370 Alexandra Road, Singapore 159953",
    postalCode: "159953",
    neighborhood: "Alexandra",
    sourceTitle: "Go-Ang Pratunam Chicken Rice (Anchorpoint) Reviews | foodpanda",
    sourceUrl:
      "https://www.foodpanda.sg/chain/cm2yf/go-ang-pratunam-chicken-rice/reviews",
    sourceKind: "foodpanda",
    platform: "foodpanda",
    rating: {
      value: 4.9,
      scale: 5,
      reviewCount: 100,
      rawReviewCount: "100+",
    },
    platformPresence: "listing_found",
    deliveryState: "listing_found",
    deliveryNote:
      "An Anchorpoint Foodpanda listing was found; exact-address delivery eligibility was not checked.",
    menuItems: [
      {
        name: "Signature Chicken Rice Bento Set",
        description: "Thai Hainanese chicken rice bento.",
        priceSgd: 12.97,
        priceText: "S$12.97",
        desiredDishMatch: false,
        flavorTags: ["savory"],
      },
    ],
  }),
  record({
    restaurantName: "Thai Cuisine (Pasir Panjang)",
    branch: "The Deck, NUS",
    address: "5 Arts Link, The Deck canteen, NUS Singapore 117570",
    postalCode: "117570",
    neighborhood: "Kent Ridge",
    sourceTitle: "Thai Cuisine (Pasir Panjang) Menu, Price | foodpanda",
    sourceUrl: "https://www.foodpanda.sg/restaurant/x0xg/thai-cuisine-pasir-panjang",
    sourceKind: "foodpanda",
    platform: "foodpanda",
    platformPresence: "listing_found",
    deliveryState: "listing_found",
    deliveryNote:
      "A Foodpanda listing was found; exact-address delivery eligibility was not checked.",
    menuItems: [
      {
        name: "Thai Minced Basil Pork Rice",
        description: null,
        priceSgd: 3.63,
        priceText: "from S$3.63",
        desiredDishMatch: true,
        flavorTags: ["savory", "strongly flavored"],
      },
    ],
  }),
  record({
    restaurantName: "Go-Ang Pratunam Chicken Rice",
    sourceTitle: "Go-Ang Pratunam Chicken Rice review aggregation",
    sourceUrl: "https://restaurantguru.com/Go-Ang-Pratunam-Chicken-Rice-Singapore",
    sourceKind: "review_aggregate",
    platform: "other",
    platformPresence: "unknown",
    notes: ["The aggregation did not identify a Singapore branch."],
  }),
];

const deepRecords: SourceRecordInput[] = [
  record({
    restaurantName: "Super Thai by Soi Aroy @ Pasir Panjang",
    branch: "Pasir Panjang",
    address: "91 Pasir Panjang Rd, Singapore 118512",
    postalCode: "118512",
    neighborhood: "Pasir Panjang",
    sourceTitle: "Super Thai by Soi Aroy @ Pasir Panjang | STAMPEDE",
    sourceUrl: "https://stampede.sg/super-thai-by-soi-aroy-pasir-panjang/about",
    sourceKind: "google_aggregate",
    platform: "google",
    rating: {
      value: 4.8,
      scale: 5,
      reviewCount: 1858,
      rawReviewCount: "1,858",
    },
    notes: ["This is an aggregator quoting Google reviews, not direct Google Maps access."],
  }),
  record({
    restaurantName: "Esarn Thai Corner Pasir Panjang",
    branch: "Pasir Panjang",
    address: "130 Pasir Panjang Rd, Singapore 118548",
    postalCode: "118548",
    neighborhood: "Pasir Panjang",
    sourceTitle: "Esarn Thai Corner Pasir Panjang | Wanderlog",
    sourceUrl: "https://wanderlog.com/place/details/4071422/esarn-thai-corner-pasir-panjang",
    sourceKind: "google_aggregate",
    platform: "google",
    rating: {
      value: 4.6,
      scale: 5,
      reviewCount: 902,
      rawReviewCount: "902",
    },
    notes: ["This is an aggregator quoting Google reviews, not direct Google Maps access."],
  }),
  record({
    restaurantName: "Nana Original Thai Food Clementi",
    branch: "Clementi",
    address: "18 Clementi Rd, Singapore 129747",
    postalCode: "129747",
    neighborhood: "Clementi",
    sourceTitle: "Nana Original Thai Food Clementi | Wanderlog",
    sourceUrl: "https://wanderlog.com/place/details/7794404",
    sourceKind: "google_aggregate",
    platform: "google",
    rating: {
      value: 3.9,
      scale: 5,
      reviewCount: 644,
      rawReviewCount: "644",
    },
    notes: ["This is an aggregator quoting Google reviews, not direct Google Maps access."],
  }),
];

export const thaiPasirPanjangFixture: FixtureData = {
  intent: thaiPasirPanjangIntent,
  broad: {
    records: broadRecords,
    warnings: [
      "Fixture data is a dated, partial simulation and must not be presented as current restaurant truth.",
    ],
  },
  deep: {
    records: deepRecords,
    warnings: [
      "Google reputation in this fixture comes from aggregators, not direct Google Maps pages.",
    ],
  },
};

export const thaiPasirPanjangRequest = {
  location: "Pasir Panjang, Singapore",
  query:
    "I want Thai food delivery around SGD 30 or below. I care about restaurants with strong reputation across Google and Foodpanda, and review count matters. I like savory, strongly flavored food and am particularly interested in Pad See Ew or basil pork.",
};

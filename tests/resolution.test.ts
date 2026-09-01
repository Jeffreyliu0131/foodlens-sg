import { describe, expect, it } from "vitest";
import { compareRecords, resolveRestaurants } from "../src/core/resolution";
import { testRecord } from "./helpers";

describe("restaurant identity resolution", () => {
  it("merges punctuation and branch-name variants at the same postal code", () => {
    const left = testRecord({
      restaurantName: "Super Thai by Soi Aroy @ Pasir Panjang",
      branch: "Pasir Panjang",
      address: "91 Pasir Panjang Road, Singapore 118512",
      postalCode: "118512",
      sourceUrl: "https://source-one.example/super-thai",
    });
    const right = testRecord({
      restaurantName: "Super Thai by Soi Aroy (Pasir Panjang)",
      branch: "Pasir Panjang",
      address: "91 Pasir Panjang Rd Singapore 118512",
      postalCode: "118512",
      sourceUrl: "https://source-two.example/super-thai",
    });

    expect(compareRecords(left, right).decision).toBe("merge");
    const resolution = resolveRestaurants([left, right]);
    expect(resolution.restaurants).toHaveLength(1);
    expect(resolution.restaurants[0].recordIds).toHaveLength(2);
    expect(resolution.restaurants[0].identityConfidence).toBe("high");
  });

  it("does not merge same-chain records with conflicting postal codes", () => {
    const anchorpoint = testRecord({
      restaurantName: "Go-Ang Pratunam Chicken Rice (Anchorpoint)",
      branch: "Anchorpoint",
      postalCode: "159953",
      sourceUrl: "https://food.example/go-ang-anchorpoint",
    });
    const vivocity = testRecord({
      restaurantName: "Go-Ang Pratunam Chicken Rice (VivoCity)",
      branch: "VivoCity",
      postalCode: "098585",
      sourceUrl: "https://food.example/go-ang-vivocity",
    });

    const comparison = compareRecords(anchorpoint, vivocity);
    expect(comparison.decision).toBe("uncertain");
    expect(comparison.signals).toContain(
      "conflicting postal codes suggest different branches",
    );
    expect(resolveRestaurants([anchorpoint, vivocity]).restaurants).toHaveLength(2);
  });

  it("keeps a generic chain listing uncertain when the branch is missing", () => {
    const branch = testRecord({
      restaurantName: "Go-Ang Pratunam Chicken Rice (Anchorpoint)",
      branch: "Anchorpoint",
      postalCode: "159953",
      sourceUrl: "https://food.example/go-ang-anchorpoint",
    });
    const generic = testRecord({
      restaurantName: "Go-Ang Pratunam Chicken Rice",
      sourceUrl: "https://reviews.example/go-ang",
    });

    expect(compareRecords(branch, generic).decision).toBe("uncertain");
  });
});

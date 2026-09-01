import type {
  ConfidenceBand,
  IdentityMatch,
  ResolutionResult,
  ResolvedRestaurant,
  SourceRecord,
} from "../shared/types";
import { stableId } from "./id";
import {
  nameParts,
  nameSimilarity,
  normalizeAddress,
  normalizePhone,
  normalizePostalCode,
  normalizeText,
  postalCodeFromAddress,
  tokenSimilarity,
  trigramSimilarity,
} from "./normalize";
import { sourceHost } from "./url";

type PairAssessment = Omit<IdentityMatch, "leftRecordId" | "rightRecordId">;

function effectivePostal(record: SourceRecord): string {
  return (
    normalizePostalCode(record.postalCode) || postalCodeFromAddress(record.address)
  );
}

function branchFor(record: SourceRecord): string {
  return nameParts(record.restaurantName, record.branch).branch;
}

export function compareRecords(
  left: SourceRecord,
  right: SourceRecord,
): PairAssessment {
  if (left.recordId === right.recordId) {
    return {
      decision: "merge",
      confidence: "high",
      signals: ["same record identifier"],
    };
  }

  const signals: string[] = [];
  const nameScore = nameSimilarity(left.restaurantName, right.restaurantName);
  const leftPostal = effectivePostal(left);
  const rightPostal = effectivePostal(right);
  const leftAddress = normalizeAddress(left.address);
  const rightAddress = normalizeAddress(right.address);
  const addressScore = Math.max(
    tokenSimilarity(leftAddress, rightAddress),
    trigramSimilarity(leftAddress, rightAddress),
  );
  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);
  const leftBranch = branchFor(left);
  const rightBranch = branchFor(right);
  const branchScore = Math.max(
    tokenSimilarity(leftBranch, rightBranch),
    trigramSimilarity(leftBranch, rightBranch),
  );
  const sameSource = left.sourceId === right.sourceId;

  if (nameScore >= 0.9) signals.push("strong normalized-name match");
  else if (nameScore >= 0.62) signals.push("partial normalized-name match");
  if (leftPostal && leftPostal === rightPostal) signals.push("same postal code");
  if (leftAddress && rightAddress && addressScore >= 0.88) {
    signals.push("same normalized address");
  }
  if (leftPhone && leftPhone === rightPhone) signals.push("same phone number");
  if (leftBranch && rightBranch && branchScore >= 0.75) {
    signals.push("compatible branch label");
  }
  if (sameSource) signals.push("same source page");

  const conflictingPostal =
    Boolean(leftPostal && rightPostal) && leftPostal !== rightPostal;
  const conflictingBranch =
    Boolean(leftBranch && rightBranch) && branchScore < 0.3;

  if (conflictingPostal && nameScore >= 0.72) {
    return {
      decision: "uncertain",
      confidence: "medium",
      signals: [...signals, "conflicting postal codes suggest different branches"],
    };
  }

  if (conflictingBranch && !leftPostal && !rightPostal && nameScore >= 0.72) {
    return {
      decision: "uncertain",
      confidence: "medium",
      signals: [...signals, "conflicting branch labels without address evidence"],
    };
  }

  if (leftPhone && leftPhone === rightPhone && nameScore >= 0.5) {
    return { decision: "merge", confidence: "high", signals };
  }

  if (leftPostal && leftPostal === rightPostal && nameScore >= 0.55) {
    return { decision: "merge", confidence: "high", signals };
  }

  if (leftAddress && rightAddress && addressScore >= 0.88 && nameScore >= 0.55) {
    return { decision: "merge", confidence: "high", signals };
  }

  if (sameSource && nameScore >= 0.7) {
    return { decision: "merge", confidence: "high", signals };
  }

  if (
    nameScore >= 0.9 &&
    ((leftBranch && rightBranch && branchScore >= 0.75) ||
      (normalizeText(left.neighborhood) &&
        normalizeText(left.neighborhood) === normalizeText(right.neighborhood)))
  ) {
    return { decision: "merge", confidence: "medium", signals };
  }

  if (nameScore >= 0.88) {
    return {
      decision: "uncertain",
      confidence: "medium",
      signals: [...signals, "location evidence is insufficient for an automatic merge"],
    };
  }

  if (nameScore >= 0.62 && (addressScore >= 0.55 || branchScore >= 0.55)) {
    return {
      decision: "uncertain",
      confidence: "low",
      signals: [...signals, "some identity signals align but not enough to merge"],
    };
  }

  return {
    decision: "separate",
    confidence: "high",
    signals: signals.length > 0 ? signals : ["no material identity match"],
  };
}

class UnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    if (this.parent[index] !== index) {
      this.parent[index] = this.find(this.parent[index]);
    }
    return this.parent[index];
  }

  union(left: number, right: number): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

function mode(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  return (
    [...counts.entries()].sort(
      ([leftValue, leftCount], [rightValue, rightCount]) =>
        rightCount - leftCount || rightValue.length - leftValue.length,
    )[0]?.[0] ?? null
  );
}

function sourcePriority(record: SourceRecord): number {
  const priority: Record<SourceRecord["sourceKind"], number> = {
    restaurant_official: 0,
    foodpanda: 1,
    google_maps: 2,
    google_aggregate: 3,
    menu_aggregate: 4,
    review_aggregate: 5,
    other: 6,
  };
  return priority[record.sourceKind];
}

function conflictsFor(records: SourceRecord[]): string[] {
  const conflicts: string[] = [];
  const ratingsByPlatform = new Map<string, number[]>();
  for (const record of records) {
    if (record.rating) {
      const ratings = ratingsByPlatform.get(record.platform) ?? [];
      ratings.push(record.rating.value);
      ratingsByPlatform.set(record.platform, ratings);
    }
  }
  for (const [platform, ratings] of ratingsByPlatform) {
    if (ratings.length >= 2 && Math.max(...ratings) - Math.min(...ratings) >= 0.6) {
      conflicts.push(`Conflicting ${platform} rating observations.`);
    }
  }

  const addresses = new Set(records.map((record) => normalizeAddress(record.address)).filter(Boolean));
  if (addresses.size > 1) {
    const postals = new Set(records.map(effectivePostal).filter(Boolean));
    if (postals.size > 1) conflicts.push("Conflicting branch addresses.");
  }
  return conflicts;
}

function identityConfidenceFor(
  records: SourceRecord[],
  matches: IdentityMatch[],
): ConfidenceBand {
  if (records.length === 1) return "low";
  const ids = new Set(records.map((record) => record.recordId));
  const mergeEdges = matches.filter(
    (match) =>
      match.decision === "merge" &&
      ids.has(match.leftRecordId) &&
      ids.has(match.rightRecordId),
  );
  const highEdges = mergeEdges.filter((match) => match.confidence === "high").length;
  return highEdges >= records.length - 1 ? "high" : "medium";
}

function evidenceConfidenceFor(
  records: SourceRecord[],
  identityConfidence: ConfidenceBand,
  conflicts: string[],
): ConfidenceBand {
  const hosts = new Set(records.map((record) => sourceHost(record.sourceUrl)));
  const hasFoodpanda = records.some((record) => record.platform === "foodpanda");
  const hasGoogle = records.some((record) => record.platform === "google");
  const maxReviews = Math.max(
    0,
    ...records.map((record) => record.rating?.reviewCount ?? 0),
  );

  if (
    hosts.size >= 2 &&
    hasFoodpanda &&
    hasGoogle &&
    maxReviews >= 500 &&
    identityConfidence !== "low" &&
    conflicts.length === 0
  ) {
    return "high";
  }
  if (hosts.size >= 2 || maxReviews >= 100 || records.length >= 2) return "medium";
  return "low";
}

export function resolveRestaurants(records: SourceRecord[]): ResolutionResult {
  const uniqueRecords = [...new Map(records.map((record) => [record.recordId, record])).values()];
  const union = new UnionFind(uniqueRecords.length);
  const matches: IdentityMatch[] = [];

  for (let left = 0; left < uniqueRecords.length; left += 1) {
    for (let right = left + 1; right < uniqueRecords.length; right += 1) {
      const assessment = compareRecords(uniqueRecords[left], uniqueRecords[right]);
      const match: IdentityMatch = {
        leftRecordId: uniqueRecords[left].recordId,
        rightRecordId: uniqueRecords[right].recordId,
        ...assessment,
      };
      matches.push(match);
      if (assessment.decision === "merge") union.union(left, right);
    }
  }

  const groups = new Map<number, SourceRecord[]>();
  for (let index = 0; index < uniqueRecords.length; index += 1) {
    const root = union.find(index);
    const group = groups.get(root) ?? [];
    group.push(uniqueRecords[index]);
    groups.set(root, group);
  }

  const restaurants: ResolvedRestaurant[] = [...groups.values()].map((group) => {
    const recordsByPriority = [...group].sort(
      (left, right) => sourcePriority(left) - sourcePriority(right),
    );
    const display = recordsByPriority[0];
    const postalCode = mode(group.map((record) => effectivePostal(record) || null));
    const address = mode(group.map((record) => record.address));
    const branch = mode(
      group.map((record) => record.branch || nameParts(record.restaurantName).branch || null),
    );
    const neighborhood = mode(group.map((record) => record.neighborhood));
    const identityConfidence = identityConfidenceFor(group, matches);
    const conflicts = conflictsFor(group);
    const entityId = stableId(
      "rst",
      [
        nameParts(display.restaurantName).base,
        postalCode || normalizeAddress(address) || normalizeText(branch) || group[0].recordId,
      ].join("|"),
    );

    return {
      entityId,
      displayName: display.restaurantName,
      branch,
      address,
      postalCode,
      neighborhood,
      recordIds: group.map((record) => record.recordId),
      sourceIds: [...new Set(group.map((record) => record.sourceId))],
      records: group,
      identityConfidence,
      evidenceConfidence: evidenceConfidenceFor(
        group,
        identityConfidence,
        conflicts,
      ),
      conflicts,
    };
  });

  return {
    restaurants: restaurants.sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    ),
    matches,
  };
}

import type { ProviderSource, SourceRecordInput } from "../shared/schemas";
import type {
  GroundedResearchRun,
  ProviderResearchRun,
  SourceRecord,
} from "../shared/types";
import { stableId } from "./id";
import { canonicalizeUrl } from "./url";

export type GroundingResult = {
  run: GroundedResearchRun;
  sources: Array<ProviderSource & { sourceId: string }>;
};

export function groundResearchRun(run: ProviderResearchRun): GroundingResult {
  const uniqueSources = new Map<string, ProviderSource>();
  for (const source of run.observedSources) {
    const canonical = canonicalizeUrl(source.url);
    if (canonical && !uniqueSources.has(canonical)) {
      uniqueSources.set(canonical, source);
    }
  }

  const acceptedRecords: SourceRecord[] = [];
  const rejectedRecords: GroundedResearchRun["rejectedRecords"] = [];
  const seenRecordIds = new Set<string>();
  const retrievedAt = new Date().toISOString();

  for (const record of run.payload.records) {
    const canonical = canonicalizeUrl(record.sourceUrl);
    if (!canonical || !uniqueSources.has(canonical)) {
      rejectedRecords.push({
        record,
        reason: "The record's source URL was not observed in search actions or URL citations.",
      });
      continue;
    }

    const sourceId = stableId("src", canonical);
    const recordId = stableId(
      "rec",
      [
        canonical,
        record.restaurantName,
        record.branch ?? "",
        record.address ?? "",
        record.postalCode ?? "",
      ].join("|"),
    );

    if (seenRecordIds.has(recordId)) continue;
    seenRecordIds.add(recordId);
    acceptedRecords.push({
      ...record,
      sourceUrl: uniqueSources.get(canonical)?.url ?? record.sourceUrl,
      sourceTitle: uniqueSources.get(canonical)?.title || record.sourceTitle,
      recordId,
      sourceId,
      retrievedAt,
    });
  }

  const sources = [...uniqueSources.entries()].map(([canonical, source]) => ({
    ...source,
    sourceId: stableId("src", canonical),
  }));

  return {
    run: {
      ...run,
      acceptedRecords,
      rejectedRecords,
    },
    sources,
  };
}

export function groundedRecord(
  record: SourceRecordInput,
  retrievedAt = new Date().toISOString(),
): SourceRecord {
  const canonical = canonicalizeUrl(record.sourceUrl) ?? record.sourceUrl;
  return {
    ...record,
    recordId: stableId(
      "rec",
      [canonical, record.restaurantName, record.branch, record.address].join("|"),
    ),
    sourceId: stableId("src", canonical),
    retrievedAt,
  };
}

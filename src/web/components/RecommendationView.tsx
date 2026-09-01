import {
  ArrowSquareOut,
  CheckCircle,
  ForkKnife,
  LinkSimple,
  MapPin,
  Scales,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  DecisionPacket,
  EvidenceClaim,
  RecommendationOption,
} from "../../shared/types";
import { TracePanel } from "./TracePanel";

function confidenceCopy(value: RecommendationOption["confidence"]): string {
  if (value === "high") return "High evidence confidence";
  if (value === "medium") return "Medium evidence confidence";
  return "Low evidence confidence";
}

function EvidenceList({
  option,
  packet,
}: {
  option: RecommendationOption;
  packet: DecisionPacket;
}) {
  const evidenceById = new Map(
    packet.evidence.map((claim) => [claim.evidenceId, claim]),
  );
  const sourceById = new Map(
    packet.sources.map((source) => [source.sourceId, source]),
  );
  const cited = option.citedEvidenceIds
    .map((id) => evidenceById.get(id))
    .filter((claim): claim is EvidenceClaim => Boolean(claim));

  if (cited.length === 0) return null;
  return (
    <details className="evidence-disclosure">
      <summary>
        <LinkSimple aria-hidden />
        Inspect {cited.length} cited facts
      </summary>
      <div className="evidence-list">
        {cited.map((claim) => {
          const source = sourceById.get(claim.sourceId);
          return (
            <div className="evidence-row" key={claim.evidenceId}>
              <div>
                <span className="evidence-label">{claim.label}</span>
                <p>{claim.value}</p>
              </div>
              {source ? (
                <a href={source.url} rel="noreferrer" target="_blank">
                  {source.title}
                  <ArrowSquareOut aria-hidden />
                </a>
              ) : (
                <span className="source-missing">Source unavailable</span>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function RestaurantOption({
  option,
  packet,
}: {
  option: RecommendationOption;
  packet: DecisionPacket;
}) {
  const restaurant = packet.restaurants.find(
    (candidate) => candidate.entityId === option.entityId,
  );
  return (
    <article className={`restaurant-option ${option.rank === 1 ? "winner" : ""}`}>
      <div className="option-rank" aria-label={`Rank ${option.rank}`}>
        #{option.rank}
      </div>
      <div className="option-body">
        <div className="option-title-row">
          <div>
            <h3>{option.restaurantName}</h3>
            {option.branch || restaurant?.address ? (
              <p className="location-line">
                <MapPin aria-hidden />
                {[option.branch, restaurant?.address].filter(Boolean).join(" | ")}
              </p>
            ) : null}
          </div>
          <span className={`confidence confidence-${option.confidence}`}>
            {confidenceCopy(option.confidence)}
          </span>
        </div>

        <p className="verdict">{option.verdict}</p>
        <p className="fit-copy">{option.fitExplanation}</p>

        <div className="component-strip" aria-label="Ranking components">
          {option.componentScores.map((component) => (
            <span className={`component component-${component.label}`} key={component.key}>
              <span>{component.key}</span>
              <strong>{component.label}</strong>
            </span>
          ))}
        </div>

        {option.recommendedDishes.length > 0 ? (
          <div className="order-block">
            <div className="order-heading">
              <ForkKnife aria-hidden weight="fill" />
              <h4>What to order</h4>
            </div>
            <div className="dish-grid">
              {option.recommendedDishes.map((dish) => (
                <div className="dish" key={`${option.entityId}-${dish.name}`}>
                  <strong>{dish.name}</strong>
                  <p>{dish.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {option.uncertainties.length > 0 ? (
          <div className="uncertainty">
            <WarningCircle aria-hidden />
            <div>
              <strong>What remains uncertain</strong>
              <ul>
                {option.uncertainties.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        <EvidenceList option={option} packet={packet} />
      </div>
    </article>
  );
}

function IdentityPanel({ packet }: { packet: DecisionPacket }) {
  if (packet.identityMatches.length === 0) return null;
  const recordNames = new Map(
    packet.restaurants.flatMap((restaurant) =>
      restaurant.records.map((record) => [record.recordId, record.restaurantName]),
    ),
  );
  return (
    <section className="inspection-section" aria-labelledby="identity-title">
      <div className="section-heading">
        <div>
          <h2 id="identity-title">Cross-platform identity</h2>
          <p>Automatic merges and pairs that remained uncertain.</p>
        </div>
        <Scales aria-hidden className="section-icon" />
      </div>
      <div className="identity-grid">
        {packet.identityMatches.map((match) => (
          <div
            className={`identity-match identity-${match.decision}`}
            key={`${match.leftRecordId}-${match.rightRecordId}`}
          >
            <span>{match.decision}</span>
            <strong>
              {recordNames.get(match.leftRecordId) ?? match.leftRecordId}
              <br />
              {recordNames.get(match.rightRecordId) ?? match.rightRecordId}
            </strong>
            <p>{match.signals.join("; ")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RecommendationView({ packet }: { packet: DecisionPacket }) {
  return (
    <div className="results-stack">
      <section className="decision-header" aria-labelledby="decision-title">
        <span className="decision-kicker">Decision</span>
        <h1 id="decision-title">{packet.decisionSummary}</h1>
        <div className="metrics-row">
          <span>{packet.provider.kind} / {packet.provider.model}</span>
          <span>{(packet.metrics.latencyMs / 1000).toFixed(1)}s</span>
          <span>{packet.metrics.searchActions} search actions</span>
          <span>{packet.metrics.sourceCount} sources</span>
          <span>{packet.metrics.acceptedRecordCount} grounded records</span>
        </div>
      </section>

      <section className="recommendations" aria-label="Ranked recommendations">
        {packet.recommendations.length > 0 ? (
          packet.recommendations.map((option) => (
            <RestaurantOption option={option} packet={packet} key={option.entityId} />
          ))
        ) : (
          <div className="no-decision">
            <WarningCircle aria-hidden />
            <div>
              <h2>No grounded recommendation</h2>
              <p>Inspect the trace and warnings before trying a broader request.</p>
            </div>
          </div>
        )}
      </section>

      {packet.warnings.length > 0 ? (
        <section className="inspection-section" aria-labelledby="warnings-title">
          <div className="section-heading">
            <div>
              <h2 id="warnings-title">Decision warnings</h2>
              <p>These limits apply to the recommendation above.</p>
            </div>
            <WarningCircle aria-hidden className="section-icon" />
          </div>
          <ul className="warning-list">
            {packet.warnings.map((warning) => (
              <li key={warning}>
                <CheckCircle aria-hidden />
                {warning}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <IdentityPanel packet={packet} />

      <section className="inspection-section" aria-labelledby="sources-title">
        <div className="section-heading">
          <div>
            <h2 id="sources-title">Source register</h2>
            <p>Every accepted fact points back to one of these public pages.</p>
          </div>
          <span className="count-label">{packet.sources.length} sources</span>
        </div>
        <div className="source-grid">
          {packet.sources.map((source) => (
            <a href={source.url} key={source.sourceId} rel="noreferrer" target="_blank">
              <LinkSimple aria-hidden />
              <span>{source.title}</span>
              <ArrowSquareOut aria-hidden />
            </a>
          ))}
        </div>
      </section>

      <TracePanel events={packet.trace} />
    </div>
  );
}

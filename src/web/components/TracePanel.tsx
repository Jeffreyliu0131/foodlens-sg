import {
  CheckCircle,
  Clock,
  MagnifyingGlass,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import type { TraceEvent } from "../../shared/types";

function StageIcon({ event }: { event: TraceEvent }) {
  if (event.status === "failed") return <XCircle aria-hidden weight="fill" />;
  if (event.status === "warning") {
    return <WarningCircle aria-hidden weight="fill" />;
  }
  if (event.status === "started") return <MagnifyingGlass aria-hidden />;
  return <CheckCircle aria-hidden weight="fill" />;
}

function stageName(stage: TraceEvent["stage"]): string {
  return stage.replaceAll("_", " ");
}

export function TracePanel({ events }: { events: TraceEvent[] }) {
  if (events.length === 0) return null;

  return (
    <section className="inspection-section" aria-labelledby="trace-title">
      <div className="section-heading">
        <div>
          <h2 id="trace-title">Research trace</h2>
          <p>Observable operations and provenance, without hidden reasoning.</p>
        </div>
        <span className="count-label">{events.length} events</span>
      </div>

      <div className="trace-list">
        {events.map((event) => (
          <details className={`trace-event trace-${event.status}`} key={event.id}>
            <summary>
              <span className="trace-icon">
                <StageIcon event={event} />
              </span>
              <span className="trace-copy">
                <span className="trace-stage">{stageName(event.stage)}</span>
                <span className="trace-summary">{event.summary}</span>
              </span>
              {event.durationMs !== null && event.durationMs > 0 ? (
                <span className="trace-duration">
                  <Clock aria-hidden />
                  {(event.durationMs / 1000).toFixed(1)}s
                </span>
              ) : null}
            </summary>
            {Object.keys(event.details).length > 0 ? (
              <pre>{JSON.stringify(event.details, null, 2)}</pre>
            ) : null}
          </details>
        ))}
      </div>
    </section>
  );
}

import type { TraceEvent, TraceStage, TraceStatus } from "../shared/types";
import { requestId } from "./id";

type FinishShape = {
  summary: string;
  details?: Record<string, unknown>;
};

export class TraceRecorder {
  readonly events: TraceEvent[] = [];
  private readonly onTrace?: (event: TraceEvent) => void | Promise<void>;

  constructor(onTrace?: (event: TraceEvent) => void | Promise<void>) {
    this.onTrace = onTrace;
  }

  private async emit(
    stage: TraceStage,
    status: TraceStatus,
    summary: string,
    details: Record<string, unknown>,
    durationMs: number | null,
  ): Promise<TraceEvent> {
    const event: TraceEvent = {
      id: requestId("trace"),
      stage,
      status,
      at: new Date().toISOString(),
      durationMs,
      summary,
      details,
    };
    this.events.push(event);
    await this.onTrace?.(event);
    return event;
  }

  async note(
    stage: TraceStage,
    status: Extract<TraceStatus, "completed" | "warning">,
    summary: string,
    details: Record<string, unknown> = {},
  ): Promise<TraceEvent> {
    return this.emit(stage, status, summary, details, 0);
  }

  async step<T>(
    stage: TraceStage,
    startSummary: string,
    startDetails: Record<string, unknown>,
    operation: () => Promise<T> | T,
    finish: (result: T) => FinishShape,
  ): Promise<T> {
    const startedAt = Date.now();
    await this.emit(stage, "started", startSummary, startDetails, null);
    try {
      const result = await operation();
      const completed = finish(result);
      await this.emit(
        stage,
        "completed",
        completed.summary,
        completed.details ?? {},
        Date.now() - startedAt,
      );
      return result;
    } catch (error) {
      await this.emit(
        stage,
        "failed",
        error instanceof Error ? error.message : "Stage failed.",
        {},
        Date.now() - startedAt,
      );
      throw error;
    }
  }
}

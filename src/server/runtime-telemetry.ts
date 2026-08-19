import {
  type BridgeRequest,
  type InstanceTelemetryWire,
  type RequestEventWire,
  type RequestKind,
  type RequestKindCountsWire,
  type OperationSummaryWire,
  type RuntimeMetricsWire,
} from "../shared/protocol.js";
import { defaultRequestLabel, METRIC_WINDOW, percentile, REQUEST_HISTORY_LIMIT, requestAttribution, requestSemantic } from "./request-telemetry.js";

interface MetricSample {
  totalMs: number;
  queueMs: number;
  executionMs: number;
}

export interface RequestTiming {
  id: string;
  enqueuedAt: number;
  dispatchedAt?: number;
  requestBytes: number;
  event: RequestEventWire;
}

export type FinalRequestStatus = "success" | "failed" | "timeout" | "cancelled";

export interface RuntimeTelemetryChanges {
  metrics: RuntimeMetricsWire;
  historyLimit: number;
  requests?: RequestEventWire[];
  operations?: OperationSummaryWire[];
  requestIdsRemoved?: string[];
  operationIdsRemoved?: string[];
  clearHistory?: boolean;
}

/** Owns request history, metrics, and semantic request classification. */
export class RuntimeTelemetry {
  readonly samples: MetricSample[] = [];
  readonly requestHistory: RequestEventWire[] = [];
  private totalCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private timeoutCount = 0;
  private cancelledCount = 0;
  private requestBytesTotal = 0;
  private responseBytesTotal = 0;
  private attributedCount = 0;
  private retryCount = 0;
  private readonly requestKinds: RequestKindCountsWire = { read: 0, write: 0, export: 0, other: 0 };
  private readonly dirtyRequestIds = new Set<string>();
  private readonly dirtyOperationIds = new Set<string>();
  private readonly removedRequestIds = new Set<string>();
  private readonly removedOperationIds = new Set<string>();
  private clearHistoryPending = false;
  private metricsCache?: RuntimeMetricsWire;

  begin(request: BridgeRequest, sessionId?: string): RequestTiming {
    const enqueuedAt = Date.now();
    const requestBytes = Buffer.byteLength(JSON.stringify({ type: "request", payload: request }));
    const semantic = requestSemantic(request);
    const attribution = requestAttribution(request);
    const event: RequestEventWire = {
      id: request.id,
      kind: semantic.kind,
      label: semantic.label,
      status: "queued",
      enqueuedAt,
      queueMs: 0,
      requestBytes,
      responseBytes: 0,
      ...(sessionId ? { sessionId } : {}),
      ...attribution,
    };
    this.requestHistory.unshift(event);
    const removed = this.requestHistory.splice(REQUEST_HISTORY_LIMIT);
    if (removed.length) this.trackRemoved(removed);
    this.totalCount++;
    this.requestKinds[event.kind]++;
    this.requestBytesTotal += requestBytes;
    if (attribution.capability) this.attributedCount++;
    if ((attribution.attempt ?? 1) > 1) this.retryCount++;
    this.markDirty(event);
    this.metricsCache = undefined;
    return { id: request.id, enqueuedAt, requestBytes, event };
  }

  markRunning(timing: RequestTiming, startedAt = Date.now()): void {
    timing.dispatchedAt = startedAt;
    timing.event.status = "running";
    timing.event.startedAt = startedAt;
    timing.event.queueMs = startedAt - timing.enqueuedAt;
    this.markDirty(timing.event);
  }

  complete(
    timing: RequestTiming,
    status: FinalRequestStatus,
    responseBytes: number,
    errorCode?: string,
    options: { sample?: boolean } = {},
  ): void {
    const event = timing.event;
    if (event.finishedAt !== undefined) return;
    if (options.sample !== false) this.recordSample(timing);
    const finishedAt = Date.now();
    event.status = status;
    event.finishedAt = finishedAt;
    event.queueMs = timing.dispatchedAt ? timing.dispatchedAt - timing.enqueuedAt : finishedAt - timing.enqueuedAt;
    event.executionMs = timing.dispatchedAt ? finishedAt - timing.dispatchedAt : 0;
    event.totalMs = finishedAt - timing.enqueuedAt;
    event.responseBytes = responseBytes;
    if (errorCode) event.errorCode = errorCode;
    this.responseBytesTotal += responseBytes;
    if (status === "success") this.successCount++;
    else if (status === "failed") this.failureCount++;
    else if (status === "timeout") this.timeoutCount++;
    else this.cancelledCount++;
    this.markDirty(event);
    this.metricsCache = undefined;
  }

  reclassify(event: RequestEventWire, kind: RequestKind): void {
    if (event.kind === kind) return;
    const hadDefaultLabel = event.label === defaultRequestLabel(event.kind);
    this.requestKinds[event.kind] = Math.max(0, this.requestKinds[event.kind] - 1);
    event.kind = kind;
    if (hadDefaultLabel) event.label = defaultRequestLabel(kind);
    this.requestKinds[kind]++;
    this.markDirty(event);
    this.metricsCache = undefined;
  }

  noteLateResponse(id: string, responseBytes: number): void {
    const event = this.requestHistory.find((item) => item.id === id);
    if (!event) return;
    event.responseBytes = Math.max(event.responseBytes, responseBytes);
    this.responseBytesTotal += responseBytes;
    this.markDirty(event);
    this.metricsCache = undefined;
  }

  clearHistory(): number {
    const count = this.requestHistory.length;
    const removed = this.requestHistory.slice();
    this.requestHistory.length = 0;
    if (removed.length) {
      this.trackRemoved(removed);
      this.clearHistoryPending = true;
    }
    return count;
  }

  metrics(): RuntimeMetricsWire {
    if (this.metricsCache) return cloneMetrics(this.metricsCache);
    const totals = this.samples.map((sample) => sample.totalMs).sort((a, b) => a - b);
    const queues = this.samples.map((sample) => sample.queueMs).sort((a, b) => a - b);
    const execs = this.samples.map((sample) => sample.executionMs).sort((a, b) => a - b);
    const last = this.samples.at(-1);
    const metrics: RuntimeMetricsWire = {
      samples: this.samples.length,
      totalCount: this.totalCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      timeoutCount: this.timeoutCount,
      cancelledCount: this.cancelledCount,
      requestKinds: { ...this.requestKinds },
      lastTotalMs: last?.totalMs ?? null,
      p50TotalMs: percentile(totals, 0.5),
      p95TotalMs: percentile(totals, 0.95),
      lastQueueMs: last?.queueMs ?? null,
      p50QueueMs: percentile(queues, 0.5),
      p95QueueMs: percentile(queues, 0.95),
      lastExecutionMs: last?.executionMs ?? null,
      p95ExecutionMs: percentile(execs, 0.95),
      errorCount: this.failureCount + this.timeoutCount,
      attributedCount: this.attributedCount,
      retryCount: this.retryCount,
      requestBytes: this.requestBytesTotal,
      responseBytes: this.responseBytesTotal,
    };
    this.metricsCache = metrics;
    return cloneMetrics(metrics);
  }

  snapshot(): InstanceTelemetryWire {
    return {
      metrics: this.metrics(),
      requests: this.requestHistory.map((event) => ({ ...event })),
      operations: summarizeOperations(this.requestHistory),
      historyLimit: REQUEST_HISTORY_LIMIT,
    };
  }

  consumeChanges(): RuntimeTelemetryChanges | null {
    const hasChanges = this.dirtyRequestIds.size > 0
      || this.dirtyOperationIds.size > 0
      || this.removedRequestIds.size > 0
      || this.removedOperationIds.size > 0
      || this.clearHistoryPending;
    if (!hasChanges) return null;
    const requests = this.requestHistory
      .filter((event) => this.dirtyRequestIds.has(event.id))
      .map((event) => ({ ...event }));
    const operationRequests = this.requestHistory.filter((event) => this.dirtyOperationIds.has(operationId(event)));
    const operations = operationRequests.length ? summarizeOperations(operationRequests) : [];
    const changes: RuntimeTelemetryChanges = {
      metrics: this.metrics(),
      historyLimit: REQUEST_HISTORY_LIMIT,
      ...(requests.length ? { requests } : {}),
      ...(operations.length ? { operations } : {}),
      ...(this.removedRequestIds.size ? { requestIdsRemoved: [...this.removedRequestIds] } : {}),
      ...(this.removedOperationIds.size ? { operationIdsRemoved: [...this.removedOperationIds] } : {}),
      ...(this.clearHistoryPending ? { clearHistory: true } : {}),
    };
    this.resetChanges();
    return changes;
  }

  resetChanges(): void {
    this.dirtyRequestIds.clear();
    this.dirtyOperationIds.clear();
    this.removedRequestIds.clear();
    this.removedOperationIds.clear();
    this.clearHistoryPending = false;
  }

  private markDirty(event: RequestEventWire): void {
    this.dirtyRequestIds.add(event.id);
    this.removedRequestIds.delete(event.id);
    const id = operationId(event);
    this.dirtyOperationIds.add(id);
    this.removedOperationIds.delete(id);
  }

  private trackRemoved(events: readonly RequestEventWire[]): void {
    for (const event of events) {
      this.dirtyRequestIds.delete(event.id);
      this.removedRequestIds.add(event.id);
      const id = operationId(event);
      if (this.requestHistory.some((candidate) => operationId(candidate) === id)) {
        this.dirtyOperationIds.add(id);
        this.removedOperationIds.delete(id);
      } else {
        this.dirtyOperationIds.delete(id);
        this.removedOperationIds.add(id);
      }
    }
  }

  private recordSample(timing: RequestTiming): void {
    const now = Date.now();
    const executionMs = timing.dispatchedAt ? now - timing.dispatchedAt : 0;
    this.samples.push({
      totalMs: now - timing.enqueuedAt,
      queueMs: timing.dispatchedAt ? timing.dispatchedAt - timing.enqueuedAt : now - timing.enqueuedAt,
      executionMs,
    });
    if (this.samples.length > METRIC_WINDOW) this.samples.splice(0, this.samples.length - METRIC_WINDOW);
  }
}

function operationId(event: RequestEventWire): string {
  return event.traceId || event.id;
}

function cloneMetrics(metrics: RuntimeMetricsWire): RuntimeMetricsWire {
  return { ...metrics, requestKinds: { ...metrics.requestKinds } };
}

export function summarizeOperations(requests: readonly RequestEventWire[]): OperationSummaryWire[] {
  const groups = new Map<string, RequestEventWire[]>();
  for (const request of requests) {
    const id = request.traceId || request.id;
    const group = groups.get(id);
    if (group) group.push(request);
    else groups.set(id, [request]);
  }

  const operations: OperationSummaryWire[] = [];
  for (const [id, group] of groups) {
    const ordered = [...group].sort((a, b) => {
      const attemptDelta = (b.attempt ?? 1) - (a.attempt ?? 1);
      return attemptDelta || b.enqueuedAt - a.enqueuedAt;
    });
    const latest = ordered[0]!;
    const startedAt = Math.min(...group.map((item) => item.enqueuedAt));
    const finishedAt = latest.finishedAt;
    const attemptCount = Math.max(...group.map((item) => item.attempt ?? 1));
    const capability = latest.capability ?? group.find((item) => item.capability)?.capability;
    const phase = latest.operationPhase ?? group.find((item) => item.operationPhase)?.operationPhase;
    const planId = latest.operationPlanId ?? group.find((item) => item.operationPlanId)?.operationPlanId;
    const stepId = latest.operationStepId ?? group.find((item) => item.operationStepId)?.operationStepId;
    const representation = latest.operationRepresentation ?? group.find((item) => item.operationRepresentation)?.operationRepresentation;
    const target = latest.operationTarget ?? group.find((item) => item.operationTarget)?.operationTarget;
    const postconditions = latest.postconditions ?? group.find((item) => item.postconditions)?.postconditions;

    operations.push({
      id,
      label: latest.label,
      kind: latest.kind,
      status: latest.status,
      startedAt,
      ...(finishedAt !== undefined ? { finishedAt, totalMs: Math.max(0, finishedAt - startedAt) } : {}),
      requestCount: group.length,
      attemptCount,
      requestIds: group.map((item) => item.id),
      ...(capability ? { capability } : {}),
      ...(phase ? { phase } : {}),
      ...(planId ? { planId } : {}),
      ...(stepId ? { stepId } : {}),
      ...(representation ? { representation } : {}),
      ...(target ? { target } : {}),
      ...(postconditions ? { postconditions: [...postconditions] } : {}),
      ...(latest.errorCode ? { errorCode: latest.errorCode } : {}),
    });
  }

  return operations.sort((a, b) => b.startedAt - a.startedAt);
}

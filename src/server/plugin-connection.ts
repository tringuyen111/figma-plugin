import { WebSocket } from "ws";
import {
  type BinaryResponseHeader,
  type BridgeRequest,
  type BridgeResponse,
  type PluginHello,
  type WireMessage,
} from "../shared/protocol.js";
import { ErrorCode, OpError } from "./errors.js";
import { hasResult, helloToInfo, type PluginInfo } from "./bridge-protocol.js";
import { RuntimeTelemetry, type RequestTiming, type RuntimeTelemetryChanges } from "./runtime-telemetry.js";

const MAX_QUEUE = 20;
const MAX_IN_FLIGHT = 1;

interface Pending {
  id: string;
  resolve: (r: BridgeResponse) => void;
  reject: (e: OpError) => void;
  timer: NodeJS.Timeout;
  timing: RequestTiming;
  onProgress?: (p: NonNullable<BridgeResponse["progress"]>) => void;
}

interface QueueItem {
  request: BridgeRequest;
  pending: Pending;
}

export type ConnectionChangeKind = "info" | "runtime";

export class PluginConnection {
  readonly pending = new Map<string, Pending>();
  readonly queue: QueueItem[] = [];
  readonly orphanedInFlight = new Set<string>();
  private readonly telemetry = new RuntimeTelemetry();
  inFlight = 0;
  lastHeartbeatAt = Date.now();

  constructor(
    public readonly instanceId: string,
    public ws: WebSocket,
    public info: PluginInfo,
    private readonly onChanged: (kind: ConnectionChangeKind) => void,
  ) {}

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  get lastHeartbeatMs(): number {
    return Date.now() - this.lastHeartbeatAt;
  }

  updateInfo(hello: PluginHello): void {
    this.info = helloToInfo(hello, this.info.connectedAt);
    this.lastHeartbeatAt = Date.now();
    this.onChanged("info");
  }

  enqueue(
    request: BridgeRequest,
    timeoutMs: number,
    onProgress?: Pending["onProgress"],
    sessionId?: string,
  ): Promise<BridgeResponse> {
    if (this.queue.length >= MAX_QUEUE) {
      return Promise.reject(new OpError(
        ErrorCode.QUEUE_FULL,
        `Request queue for instance "${this.instanceId}" is full (${this.queue.length}/${MAX_QUEUE}).`,
        "Wait for the current Figma execution to finish or combine related work into one figma_exec call.",
      ));
    }

    return new Promise<BridgeResponse>((resolve, reject) => {
      const id = request.id;
      const timing = this.telemetry.begin(request, sessionId);

      const timer = setTimeout(() => {
        const current = this.pending.get(id);
        if (!current) return;
        const queuedIndex = this.queue.findIndex((q) => q.pending.id === id);
        if (queuedIndex >= 0) {
          this.queue.splice(queuedIndex, 1);
          this.pending.delete(id);
          this.telemetry.complete(current.timing, "timeout", 0, ErrorCode.PLUGIN_TIMEOUT);
          reject(new OpError(
            ErrorCode.PLUGIN_TIMEOUT,
            `figma_exec exceeded its ${timeoutMs}ms total deadline while waiting in queue.`,
            "The call was never dispatched. Retry when the target window is ready or combine related work into one figma_exec call.",
          ));
          this.drainQueue();
          this.onChanged("runtime");
          return;
        }

        // A server-side timeout cannot stop synchronous JavaScript already
        // running in Figma. Reject the caller, but keep the execution slot
        // occupied until a late response or disconnect proves it is over.
        this.pending.delete(id);
        this.orphanedInFlight.add(id);
        this.telemetry.complete(current.timing, "timeout", 0, ErrorCode.PLUGIN_TIMEOUT);
        reject(new OpError(
          ErrorCode.PLUGIN_TIMEOUT,
          `figma_exec exceeded its ${timeoutMs}ms total execution deadline.`,
          "The Figma code may still be running and may still mutate the file. Inspect the target before retrying to avoid duplicate side effects.",
        ));
        this.onChanged("runtime");
      }, timeoutMs);
      timer.unref?.();

      const pending: Pending = {
        id,
        resolve,
        reject,
        timer,
        timing,
        ...(onProgress ? { onProgress } : {}),
      };
      this.pending.set(id, pending);
      this.queue.push({ request, pending });
      this.drainQueue();
      this.onChanged("runtime");
    });
  }

  private drainQueue(): void {
    if (!this.open) return;
    while (this.queue.length > 0 && this.inFlight < MAX_IN_FLIGHT) {
      const item = this.queue.shift();
      if (!item || !this.pending.has(item.pending.id)) continue;
      const startedAt = Date.now();
      this.telemetry.markRunning(item.pending.timing, startedAt);
      this.inFlight++;
      this.send({ type: "request", payload: item.request });
    }
  }

  onResponse(res: BridgeResponse): void {
    const pending = this.pending.get(res.id);
    if (!pending) {
      if (this.orphanedInFlight.delete(res.id)) {
        this.telemetry.noteLateResponse(res.id, Buffer.byteLength(JSON.stringify({ type: "response", payload: res })));
        if (this.inFlight > 0) this.inFlight--;
        this.drainQueue();
        this.onChanged("runtime");
      }
      return;
    }
    if (res.progress && res.error === undefined && !hasResult(res)) {
      pending.onProgress?.(res.progress);
      this.lastHeartbeatAt = Date.now();
      return;
    }
    if (res.progress) pending.onProgress?.(res.progress);
    const responseBytes = Buffer.byteLength(JSON.stringify({ type: "response", payload: res }));
    this.finish(res.id, res.ok, responseBytes, res.error?.code);
    pending.resolve(res);
  }

  onBinaryResponse(header: BinaryResponseHeader, bytes: Uint8Array): void {
    const pending = this.pending.get(header.id);
    if (!pending) {
      if (this.orphanedInFlight.delete(header.id)) {
        this.telemetry.noteLateResponse(header.id, bytes.byteLength);
        if (this.inFlight > 0) this.inFlight--;
        this.drainQueue();
        this.onChanged("runtime");
      }
      return;
    }
    this.telemetry.reclassify(pending.timing.event, "export");
    const result: Record<string, unknown> = { format: header.format, bytes };
    if (header.metadata) Object.assign(result, header.metadata);
    const res: BridgeResponse = { id: header.id, ok: true, result, ...(header.warnings?.length ? { warnings: header.warnings } : {}) };
    this.finish(header.id, true, bytes.byteLength);
    pending.resolve(res);
  }

  clearQueued(): number {
    const queued = this.queue.splice(0);
    for (const item of queued) {
      const pending = this.pending.get(item.pending.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(pending.id);
      this.telemetry.complete(pending.timing, "cancelled", 0, ErrorCode.CANCELLED, { sample: false });
      pending.reject(new OpError(ErrorCode.CANCELLED, "Queued Figma operation was cleared before dispatch.", "Retry when the target window is ready."));
    }
    this.onChanged("runtime");
    return queued.length;
  }

  clearRequestHistory(): number {
    const count = this.telemetry.clearHistory();
    this.onChanged("runtime");
    return count;
  }

  private finish(id: string, ok: boolean, responseBytes: number, errorCode?: ErrorCode | string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (pending.timing.dispatchedAt && this.inFlight > 0) this.inFlight--;
    this.telemetry.complete(pending.timing, ok ? "success" : "failed", responseBytes, errorCode);
    this.drainQueue();
    this.onChanged("runtime");
  }


  failAll(err: OpError): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      this.telemetry.complete(pending.timing, "failed", 0, err.code);
      pending.reject(err);
    }
    this.pending.clear();
    this.queue.length = 0;
    this.orphanedInFlight.clear();
    this.inFlight = 0;
    this.onChanged("runtime");
  }

  metrics() {
    return this.telemetry.metrics();
  }

  telemetrySnapshot() {
    return this.telemetry.snapshot();
  }

  consumeTelemetryChanges(): RuntimeTelemetryChanges | null {
    return this.telemetry.consumeChanges();
  }

  resetTelemetryChanges(): void {
    this.telemetry.resetChanges();
  }

  send(message: WireMessage): void {
    if (!this.open) return;
    this.ws.send(JSON.stringify(message));
  }
}

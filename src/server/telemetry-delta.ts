import type { InstanceSummaryWire, RuntimeLoadWire, SessionSummaryWire, TelemetryDelta } from "../shared/protocol.js";
import type { PluginConnection } from "./plugin-connection.js";
import type { RuntimeTelemetryChanges } from "./runtime-telemetry.js";

const DELTA_FLUSH_MS = 16;

export class TelemetryChannel {
  private readonly sequences = new Map<PluginConnection, number>();
  private readonly flushTimers = new Map<PluginConnection, NodeJS.Timeout>();

  forget(conn: PluginConnection): void {
    const timer = this.flushTimers.get(conn);
    if (timer) clearTimeout(timer);
    this.flushTimers.delete(conn);
    this.sequences.delete(conn);
  }

  sendState(conn: PluginConnection, instances: InstanceSummaryWire[], sessions: SessionSummaryWire[]): void {
    const seq = this.sequences.get(conn);
    if (seq === undefined) {
      this.sendFull(conn, instances, sessions);
      return;
    }
    conn.send({ type: "instances", self: conn.instanceId, instances, sessions, telemetrySeq: seq });
  }

  sendFull(conn: PluginConnection, instances: InstanceSummaryWire[], sessions: SessionSummaryWire[]): void {
    const timer = this.flushTimers.get(conn);
    if (timer) clearTimeout(timer);
    this.flushTimers.delete(conn);
    const seq = this.sequences.get(conn) ?? 0;
    const telemetry = conn.telemetrySnapshot();
    conn.resetTelemetryChanges();
    this.sequences.set(conn, seq);
    conn.send({ type: "instances", self: conn.instanceId, instances, sessions, telemetry, telemetrySeq: seq });
  }

  scheduleDelta(conn: PluginConnection): boolean {
    if (!this.sequences.has(conn)) return false;
    if (this.flushTimers.has(conn)) return true;
    const timer = setTimeout(() => {
      this.flushTimers.delete(conn);
      this.flushDelta(conn);
    }, DELTA_FLUSH_MS);
    timer.unref?.();
    this.flushTimers.set(conn, timer);
    return true;
  }

  private flushDelta(conn: PluginConnection): void {
    const currentSeq = this.sequences.get(conn);
    if (currentSeq === undefined) return;
    const changes = conn.consumeTelemetryChanges();
    if (!changes) return;
    const seq = currentSeq + 1;
    this.sequences.set(conn, seq);
    conn.send(createTelemetryDelta(conn.instanceId, seq, runtimeLoad(conn), changes));
  }
}

export function createTelemetryDelta(
  self: string,
  seq: number,
  runtime: RuntimeLoadWire,
  changes: RuntimeTelemetryChanges,
): TelemetryDelta {
  return { type: "telemetry_delta", self, seq, runtime, ...changes };
}

function runtimeLoad(conn: PluginConnection): RuntimeLoadWire {
  return { queueLength: conn.queue.length, pendingCount: conn.pending.size, inFlight: conn.inFlight };
}

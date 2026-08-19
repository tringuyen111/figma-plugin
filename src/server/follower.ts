import { request } from "node:http";
import {
  PROTOCOL_VERSION,
  type InstanceSummaryWire,
  type LeaderInfo,
} from "../shared/protocol.js";
import { ErrorCode, OpError, toBridgeError } from "./errors.js";
import { decodeRpcResult } from "./rpc-wire.js";
import { RUNTIME_SERVICE } from "./version.js";

const FORWARD_TIMEOUT_MS = 125_000;
export const STATUS_RPC_TIMEOUT_MS = 2_000;
const MAX_HEALTH_BYTES = 512 * 1024;
const MAX_RPC_BYTES = 16 * 1024 * 1024;

export interface HealthPayload {
  ok?: boolean;
  service?: string;
  serverVersion?: string;
  protocolVersion?: number;
  port?: number;
  pluginConnected?: boolean;
  plugin?: {
    version: string;
    protocolVersion: number;
    instanceId: string;
    fileName: string;
    pageId: string;
    pageName: string;
    editorType: string;
  } | null;
  instances?: InstanceSummaryWire[];
  lastHeartbeatMs?: number | null;
  queueLength?: number;
  pendingCount?: number;
}

interface RpcEnvelope {
  ok?: boolean;
  result?: unknown;
  error?: { code: ErrorCode; message: string; hint?: string };
}

export class Follower {
  constructor(public readonly info: LeaderInfo) {}

  static async checkHealth(info: LeaderInfo, timeoutMs = 1_500): Promise<boolean> {
    const health = await Follower.fetchHealth(info.port, timeoutMs, info.token);
    return !!health
      && health.ok === true
      && health.service === RUNTIME_SERVICE
      && health.protocolVersion === PROTOCOL_VERSION
      && health.port === info.port
      && health.serverVersion === info.version;
  }

  static fetchHealth(port: number, timeoutMs = 1_500, token?: string): Promise<HealthPayload | undefined> {
    return requestJson<HealthPayload>({
      port,
      path: "/health",
      method: "GET",
      timeoutMs,
      maxBytes: MAX_HEALTH_BYTES,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    }).catch(() => undefined);
  }

  async forward(
    op: string,
    params: Record<string, unknown>,
    sessionId?: string,
    instanceId?: string,
    pageId?: string,
    timeoutMs = FORWARD_TIMEOUT_MS,
  ): Promise<unknown> {
    const payload = JSON.stringify({
      op,
      params,
      ...(sessionId ? { sessionId } : {}),
      ...(instanceId ? { instanceId } : {}),
      ...(pageId ? { pageId } : {}),
    });

    let envelope: RpcEnvelope;
    try {
      envelope = await requestJson<RpcEnvelope>({
        port: this.info.port,
        path: "/rpc",
        method: "POST",
        timeoutMs,
        body: payload,
        maxBytes: MAX_RPC_BYTES,
        headers: { authorization: `Bearer ${this.info.token}` },
      });
    } catch (cause) {
      if (cause instanceof HttpStatusError && cause.status === 401) {
        throw new OpError(
          ErrorCode.UNAUTHORIZED,
          "Leader rejected the local bridge token.",
          "Refresh the leader record or restart the local Figma Plugin runtime.",
        );
      }
      if (cause instanceof RequestTimeoutError) {
        throw new OpError(
          ErrorCode.PLUGIN_TIMEOUT,
          `Forward of "${op}" to the local leader timed out.`,
          "Inspect figma_status before retrying; the target execution may still be active.",
        );
      }
      const wire = toBridgeError(cause, ErrorCode.NOT_CONNECTED, "Could not reach the local Figma Plugin leader.");
      throw new OpError(wire.code, wire.message, wire.hint);
    }

    if (envelope.ok === true) return decodeRpcResult(envelope.result);
    if (envelope.error) throw new OpError(envelope.error.code, envelope.error.message, envelope.error.hint);
    throw new OpError(ErrorCode.INTERNAL, "Leader returned a malformed RPC envelope.");
  }
}

interface RequestOptions {
  port: number;
  path: string;
  method: "GET" | "POST";
  timeoutMs: number;
  maxBytes: number;
  body?: string;
  headers?: Record<string, string>;
}

class RequestTimeoutError extends Error {}
class HttpStatusError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function requestJson<T>(options: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const bodyBytes = options.body ? Buffer.byteLength(options.body) : 0;
    const req = request({
      host: "127.0.0.1",
      port: options.port,
      path: options.path,
      method: options.method,
      timeout: options.timeoutMs,
      headers: {
        ...(options.body ? { "content-type": "application/json", "content-length": String(bodyBytes) } : {}),
        ...(options.headers ?? {}),
      },
    }, (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        res.resume();
        reject(new HttpStatusError(res.statusCode ?? 500));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer | string) => {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += part.byteLength;
        if (total > options.maxBytes) {
          res.destroy(new Error("response too large"));
          return;
        }
        chunks.push(part);
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
        } catch (cause) {
          reject(cause);
        }
      });
      res.on("error", reject);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new RequestTimeoutError());
    });
    req.on("error", reject);
    if (options.body) req.end(options.body);
    else req.end();
  });
}

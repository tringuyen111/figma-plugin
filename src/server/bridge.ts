import { createServer, type Server as HttpServer, type ServerResponse, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import {
  DEFAULT_OP_TIMEOUT_MS,
  HEARTBEAT_DEAD_MS,
  HEARTBEAT_INTERVAL_MS,
  OP_TIMEOUTS,
  PROTOCOL_VERSION,
  type BridgeRequest,
  type BridgeResponse,
  type InstanceSummaryWire,
  type Operation,
  type PluginHello,
  type SessionSummaryWire,
} from "../shared/protocol.js";
import { ErrorCode, OpError, toBridgeError } from "./errors.js";
import { encodeRpcResult } from "./rpc-wire.js";
import { BUNDLE_REVISION, RUNTIME_SERVICE, VERSION } from "./version.js";
import { decodeBinaryFrame, helloToInfo, isClientWireMessage, MAX_WS_PAYLOAD_BYTES, readBody, validId, type PluginInfo } from "./bridge-protocol.js";
import { PluginConnection, type ConnectionChangeKind } from "./plugin-connection.js";
import { TelemetryChannel } from "./telemetry-delta.js";
import { assertTypedCapability } from "./capability-guard.js";
const MAX_WS_CLIENTS = 32;
const HANDSHAKE_TIMEOUT_MS = 5_000;

export type { PluginInfo } from "./bridge-protocol.js";
export type InstanceSummary = InstanceSummaryWire;

export interface DispatchOptions {
  timeoutMs?: number;
  onProgress?: (p: NonNullable<BridgeResponse["progress"]>) => void;
  instanceId?: string;
  sessionId?: string;
  pageId?: string;
}

export interface BridgeHandlers {
  onRpc?: (
    op: string,
    params: Record<string, unknown>,
    sessionId?: string,
    instanceId?: string,
    pageId?: string,
  ) => Promise<unknown>;
}
export class Bridge {
  private http?: HttpServer;
  private wss?: WebSocketServer;
  private readonly instances = new Map<string, PluginConnection>();
  private readonly bySocket = new Map<WebSocket, PluginConnection>();
  private readonly telemetryChannel = new TelemetryChannel();
  private readonly stagedSockets = new Set<WebSocket>();
  private readonly handshakeTimers = new Map<WebSocket, NodeJS.Timeout>();
  private readonly sessionBindings = new Map<string, { instanceId: string; notified: boolean }>();
  private sessionsProvider?: () => SessionSummaryWire[];
  private boundPort = 0;
  private authToken = "";
  private trustedClientId?: string;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(private readonly handlers: BridgeHandlers = {}) {}

  setSessionsProvider(fn: () => SessionSummaryWire[]): void {
    this.sessionsProvider = fn;
  }

  refreshState(): void {
    this.broadcastInstances();
  }

  sessionBinding(sessionId: string): string | undefined {
    return this.sessionBindings.get(sessionId)?.instanceId;
  }

  get port(): number { return this.boundPort; }
  get pluginConnected(): boolean { return [...this.instances.values()].some((c) => c.open); }
  get instanceCount(): number { return this.instances.size; }
  get queueLength(): number { return [...this.instances.values()].reduce((n, c) => n + c.queue.length, 0); }
  get pendingCount(): number { return [...this.instances.values()].reduce((n, c) => n + c.pending.size, 0); }
  get lastHeartbeatMs(): number | null { return this.instances.size ? Math.max(...[...this.instances.values()].map((c) => c.lastHeartbeatMs)) : null; }

  get plugin(): PluginInfo | undefined {
    if (this.instances.size !== 1) return undefined;
    return this.instances.values().next().value?.info;
  }

  instanceSummaries(includePages = true): InstanceSummary[] {
    return [...this.instances.values()].map((c) => ({
      instanceId: c.instanceId,
      clientId: c.info.clientId,
      fileKey: c.info.fileKey,
      fileName: c.info.fileName,
      pageId: c.info.pageId,
      pageName: c.info.pageName,
      ...(includePages ? { pages: c.info.pages } : {}),
      editorType: c.info.editorType,
      bundleRevision: c.info.bundleRevision,
      runtimeSdks: [...c.info.runtimeSdks],
      ...(c.info.features ? { features: c.info.features } : {}),
      ...(c.info.sync ? { sync: c.info.sync } : {}),
      queueLength: c.queue.length,
      pendingCount: c.pending.size,
      inFlight: c.inFlight,
      lastHeartbeatMs: c.lastHeartbeatMs,
      metrics: c.metrics(),
    }));
  }

  async listen(port: number, token: string): Promise<number> {
    this.authToken = token;
    await this.listenOn(port);
    this.boundPort = port;
    this.startHeartbeat();
    return port;
  }

  private listenOn(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const http = createServer((req, res) => void this.handleHttp(req, res));
      const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD_BYTES });
      this.http = http;
      this.wss = wss;

      http.on("upgrade", (req, socket, head) => {
        if (req.url !== "/ws") { socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, (client) => wss.emit("connection", client, req));
      });
      wss.on("connection", (client) => {
        if (wss.clients.size > MAX_WS_CLIENTS) {
          client.close(1013, "too-many-clients");
          return;
        }
        this.stagedSockets.add(client);
        const timer = setTimeout(() => {
          if (this.stagedSockets.delete(client)) client.close(1008, "handshake-timeout");
          this.handshakeTimers.delete(client);
        }, HANDSHAKE_TIMEOUT_MS);
        timer.unref?.();
        this.handshakeTimers.set(client, timer);
        client.on("message", (data, isBinary) => this.onWsMessage(client, data, isBinary));
        client.on("close", () => this.onWsClose(client));
        client.on("error", () => {});
      });

      http.once("error", reject);
      http.listen(port, "127.0.0.1", () => {
        http.off("error", reject);
        resolve();
      });
    });
  }

  private onWsMessage(client: WebSocket, data: RawData, isBinary: boolean): void {
    const conn = this.bySocket.get(client);
    if (isBinary) {
      if (!conn) {
        client.close(1008, "invalid-message");
        return;
      }
      const decoded = decodeBinaryFrame(data);
      if (!decoded) {
        client.close(1008, "invalid-message");
        return;
      }
      conn.lastHeartbeatAt = Date.now();
      conn.onBinaryResponse(decoded.header, decoded.bytes);
      return;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(data.toString()); } catch {
      client.close(1008, "invalid-message");
      return;
    }
    if (!isClientWireMessage(parsed)) {
      client.close(1008, "invalid-message");
      return;
    }
    const msg = parsed;

    if (!conn) {
      if (msg.type !== "hello") return;
      this.acceptHello(client, msg);
      return;
    }

    conn.lastHeartbeatAt = Date.now();
    switch (msg.type) {
      case "hello":
        if (msg.instanceId !== conn.instanceId || msg.clientId !== conn.info.clientId) {
          client.close(1008, "identity-changed");
          return;
        }
        conn.updateInfo(msg);
        break;
      case "response":
        conn.onResponse(msg.payload);
        break;
      case "ping":
        conn.send({ type: "pong", at: Date.now() });
        break;
      case "pong":
        break;
      case "telemetry_resync":
        this.sendFullSnapshot(conn);
        break;
      case "bind":
        this.sessionBindings.set(msg.sessionId, { instanceId: conn.instanceId, notified: false });
        this.broadcastInstances();
        break;
      case "clear_queue":
        conn.clearQueued();
        break;
      case "clear_request_log":
        conn.clearRequestHistory();
        break;
      default:
        break;
    }
  }

  private acceptHello(client: WebSocket, hello: PluginHello): void {
    if (
      hello.protocolVersion !== PROTOCOL_VERSION ||
      !validId(hello.instanceId) ||
      !validId(hello.clientId)
    ) {
      client.close(1008, "invalid-handshake");
      return;
    }

    if (this.trustedClientId === undefined) {
      // Process-local trust-on-first-use: all Figma windows from the same
      // plugin installation share clientStorage and therefore one clientId.
      // This adds zero-click continuity against unrelated browser/socket
      // clients without pretending to protect against a hostile local process.
      this.trustedClientId = hello.clientId;
    } else if (hello.clientId !== this.trustedClientId) {
      client.close(1008, "untrusted-client");
      return;
    }

    const previous = this.instances.get(hello.instanceId);
    if (previous && previous.ws !== client) {
      previous.failAll(new OpError(ErrorCode.CONNECTION_LOST, `Figma instance "${hello.instanceId}" reconnected.`));
      try { previous.ws.close(1012, "instance-replaced"); } catch {}
      this.bySocket.delete(previous.ws);
      this.telemetryChannel.forget(previous);
    }

    let conn!: PluginConnection;
    conn = new PluginConnection(hello.instanceId, client, helloToInfo(hello), (kind) => this.onConnectionChanged(conn, kind));
    this.instances.set(hello.instanceId, conn);
    this.bySocket.set(client, conn);
    this.stagedSockets.delete(client);
    const handshakeTimer = this.handshakeTimers.get(client);
    if (handshakeTimer) clearTimeout(handshakeTimer);
    this.handshakeTimers.delete(client);
    conn.send({ type: "assigned", instanceId: hello.instanceId });
    this.broadcastInstances();
  }

  private onWsClose(client: WebSocket): void {
    this.stagedSockets.delete(client);
    const handshakeTimer = this.handshakeTimers.get(client);
    if (handshakeTimer) clearTimeout(handshakeTimer);
    this.handshakeTimers.delete(client);
    const conn = this.bySocket.get(client);
    if (!conn) return;
    this.bySocket.delete(client);
    this.telemetryChannel.forget(conn);
    if (this.instances.get(conn.instanceId) === conn) this.instances.delete(conn.instanceId);
    conn.failAll(new OpError(ErrorCode.CONNECTION_LOST, `Figma instance "${conn.instanceId}" disconnected.`, "Reopen Figma Plugin in that Figma window and retry."));
    for (const [sessionId, binding] of this.sessionBindings) {
      if (binding.instanceId === conn.instanceId) this.sessionBindings.delete(sessionId);
    }
    this.broadcastInstances();
  }

  private broadcastInstances(): void {
    // The UI needs runtime/window state, not every page of every other window.
    // Full page lists remain available through diagnostics/figma_status.
    const instances = this.instanceSummaries(false);
    const sessions = this.currentSessions();
    for (const conn of this.instances.values()) {
      this.telemetryChannel.sendState(conn, instances, sessions);
    }
  }

  private sendFullSnapshot(conn: PluginConnection): void {
    const instances = this.instanceSummaries(false);
    const sessions = this.currentSessions();
    this.telemetryChannel.sendFull(conn, instances, sessions);
  }

  private onConnectionChanged(conn: PluginConnection, kind: ConnectionChangeKind): void {
    if (this.instances.get(conn.instanceId) !== conn) return;
    if (kind === "info") this.broadcastInstances();
    else this.broadcastRuntimeChange(conn);
  }

  private broadcastRuntimeChange(changed: PluginConnection): void {
    const instances = this.instanceSummaries(false);
    const sessions = this.currentSessions();
    for (const conn of this.instances.values()) {
      if (conn === changed) {
        if (!this.telemetryChannel.scheduleDelta(conn)) this.broadcastInstances();
      } else {
        this.telemetryChannel.sendState(conn, instances, sessions);
      }
    }
  }

  private currentSessions(): SessionSummaryWire[] {
    return (this.sessionsProvider?.() ?? []).map((s) => ({
      ...s,
      boundInstanceId: this.sessionBindings.get(s.id)?.instanceId ?? null,
    }));
  }

  async dispatch(op: Operation, params: Record<string, unknown>, opts: DispatchOptions = {}): Promise<BridgeResponse> {
    let conn: PluginConnection | undefined;

    if (opts.instanceId) {
      conn = this.instances.get(opts.instanceId);
      if (!conn) {
        throw new OpError(
          ErrorCode.TARGET_NOT_FOUND,
          `No Figma plugin instance "${opts.instanceId}" is connected.`,
          this.instances.size ? `Connected instances: ${this.describeInstances()}.` : "No Figma plugin is connected.",
        );
      }
    } else if (opts.sessionId) {
      const binding = this.sessionBindings.get(opts.sessionId);
      if (binding) conn = this.instances.get(binding.instanceId);
    }

    if (!conn) {
      if (this.instances.size === 0) {
        throw new OpError(ErrorCode.NOT_CONNECTED, "No Figma plugin instance is connected.", "Open Figma Plugin in the target Figma window, then retry.");
      }
      if (this.instances.size === 1) conn = this.instances.values().next().value as PluginConnection;
      else {
        throw new OpError(
          ErrorCode.AMBIGUOUS_TARGET,
          `${this.instances.size} Figma plugin instances are connected and no target was selected.`,
          `Choose an instanceId from figma_status or bind this agent session in the Figma Plugin window. Connected: ${this.describeInstances()}.`,
        );
      }
    }

    const request: BridgeRequest = {
      id: randomUUID(),
      op,
      params,
      ...(opts.pageId ? { targetPageId: opts.pageId } : {}),
    };
    const requestedRuntimeSdk = params["runtimeSdk"];
    if (typeof requestedRuntimeSdk === "string" && !conn.info.runtimeSdks.includes(requestedRuntimeSdk)) {
      throw new OpError(
        ErrorCode.UNSUPPORTED_OPERATION,
        `Figma instance "${conn.instanceId}" does not advertise runtimeSdk "${requestedRuntimeSdk}".`,
        `Reload Figma Plugin in that window from the rebuilt development manifest. Loaded SDKs: ${conn.info.runtimeSdks.join(", ") || "none"}.`,
      );
    }
    if (requestedRuntimeSdk === "v2" && conn.info.bundleRevision !== BUNDLE_REVISION) {
      throw new OpError(
        ErrorCode.UNSUPPORTED_OPERATION,
        `Figma instance "${conn.instanceId}" has bundle revision "${conn.info.bundleRevision}", expected "${BUNDLE_REVISION}" for runtimeSdk "v2".`,
        "Reload Figma Plugin from the rebuilt development manifest so the companion and MCP server consume the same bundle revision.",
      );
    }
    assertTypedCapability(conn.info, op, params, BUNDLE_REVISION);
    const timeoutMs = opts.timeoutMs ?? OP_TIMEOUTS[op] ?? DEFAULT_OP_TIMEOUT_MS;
    const res = await conn.enqueue(request, timeoutMs, opts.onProgress, opts.sessionId);

    if (opts.sessionId) {
      const binding = this.sessionBindings.get(opts.sessionId);
      if (binding && binding.instanceId === conn.instanceId && !binding.notified) {
        binding.notified = true;
        res.warnings = [
          ...(res.warnings ?? []),
          `This agent session is bound to Figma instance "${conn.instanceId}" (${conn.info.fileName} / ${conn.info.pageName}).`,
        ];
      }
    }
    return res;
  }

  private describeInstances(): string {
    return this.instanceSummaries().map((i) => `"${i.instanceId}" (${i.fileName} / ${i.pageName})`).join(", ");
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "GET" && req.url === "/health") {
      if (req.headers.authorization !== `Bearer ${this.authToken}`) {
        this.json(res, 401, { ok: false, error: { code: ErrorCode.UNAUTHORIZED, message: "Invalid bridge token." } });
        return;
      }
      this.json(res, 200, {
        ok: true,
        service: RUNTIME_SERVICE,
        serverVersion: VERSION,
        protocolVersion: PROTOCOL_VERSION,
        port: this.boundPort,
        pluginConnected: this.pluginConnected,
        plugin: this.plugin ? {
          version: this.plugin.version,
          bundleRevision: this.plugin.bundleRevision,
          protocolVersion: this.plugin.protocolVersion,
          instanceId: this.plugin.instanceId,
          fileName: this.plugin.fileName,
          pageId: this.plugin.pageId,
          pageName: this.plugin.pageName,
          editorType: this.plugin.editorType,
        } : null,
        instances: this.instanceSummaries(),
        lastHeartbeatMs: this.lastHeartbeatMs,
        queueLength: this.queueLength,
        pendingCount: this.pendingCount,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/rpc") {
      if (req.headers.authorization !== `Bearer ${this.authToken}`) {
        this.json(res, 401, { ok: false, error: { code: ErrorCode.UNAUTHORIZED, message: "Invalid bridge token." } });
        return;
      }
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { op?: string; params?: Record<string, unknown>; sessionId?: string; instanceId?: string; pageId?: string };
        const result = await this.handlers.onRpc?.(body.op ?? "", body.params ?? {}, body.sessionId, body.instanceId, body.pageId);
        this.json(res, 200, { ok: true, result: encodeRpcResult(result) });
      } catch (err) {
        // RPC-domain failures stay inside the JSON envelope so followers can
        // preserve exact ControlMux Figma error codes. HTTP status is reserved
        // for transport/authentication failures.
        this.json(res, 200, { ok: false, error: toBridgeError(err) });
      }
      return;
    }

    this.json(res, 404, { ok: false, error: { code: ErrorCode.INVALID_PARAMS, message: "Not found." } });
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    const json = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json) });
    res.end(json);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const conn of this.instances.values()) {
        if (now - conn.lastHeartbeatAt > HEARTBEAT_DEAD_MS) {
          try { conn.ws.terminate(); } catch {}
          continue;
        }
        conn.send({ type: "ping", at: now });
      }
      this.broadcastInstances();
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const shutdown = new OpError(ErrorCode.CONNECTION_LOST, "Figma Plugin bridge is shutting down.");
    for (const conn of this.instances.values()) conn.failAll(shutdown);
    if (this.wss) {
      for (const client of this.wss.clients) {
        try { client.terminate(); } catch {}
      }
    }
    this.instances.clear();
    this.bySocket.clear();
    this.stagedSockets.clear();
    for (const timer of this.handshakeTimers.values()) clearTimeout(timer);
    this.handshakeTimers.clear();
    this.trustedClientId = undefined;
    await new Promise<void>((resolve) => this.wss ? this.wss.close(() => resolve()) : resolve());
    await new Promise<void>((resolve) => {
      if (!this.http) return resolve();
      this.http.closeAllConnections?.();
      this.http.close(() => resolve());
    });
  }
}

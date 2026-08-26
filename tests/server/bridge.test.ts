import { afterEach, describe, expect, it } from "vitest";
import { createServer as createNetServer } from "node:net";
import { request as httpRequest } from "node:http";
import WebSocket, { type RawData } from "ws";
import { Bridge } from "../../src/server/bridge.js";
import { ErrorCode, PROTOCOL_VERSION, type BridgeRequest, type InstanceTelemetryWire, type TelemetryDelta, type WireMessage } from "../../src/shared/protocol.js";
import { OpError } from "../../src/server/errors.js";
import { Follower } from "../../src/server/follower.js";
import { VERSION } from "../../src/server/version.js";

const bridges: Bridge[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    try { socket.terminate(); } catch {}
  }
  for (const bridge of bridges.splice(0)) await bridge.close();
});

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No TCP port"));
      const port = address.port;
      server.close((err) => err ? reject(err) : resolve(port));
    });
  });
}

async function startBridge(): Promise<{ bridge: Bridge; port: number }> {
  const bridge = new Bridge();
  bridges.push(bridge);
  const port = await freePort();
  await bridge.listen(port, "test-token");
  return { bridge, port };
}

interface FakePlugin {
  ws: WebSocket;
  requests: BridgeRequest[];
  messages: WireMessage[];
  sendResponse: (id: string, result: unknown) => void;
  sendFailure: (id: string, code?: ErrorCode) => void;
  latestTelemetry: () => InstanceTelemetryWire | undefined;
}

function applyTelemetryDeltaForTest(base: InstanceTelemetryWire, delta: TelemetryDelta): InstanceTelemetryWire {
  const telemetry: InstanceTelemetryWire = {
    ...base,
    metrics: delta.metrics,
    historyLimit: delta.historyLimit,
    requests: base.requests.map((item) => ({ ...item })),
    operations: base.operations.map((item) => ({ ...item })),
  };
  if (delta.clearHistory) {
    telemetry.requests = [];
    telemetry.operations = [];
  }
  for (const id of delta.requestIdsRemoved ?? []) telemetry.requests = telemetry.requests.filter((item) => item.id !== id);
  for (const id of delta.operationIdsRemoved ?? []) telemetry.operations = telemetry.operations.filter((item) => item.id !== id);
  for (const item of [...(delta.requests ?? [])].reverse()) {
    const index = telemetry.requests.findIndex((current) => current.id === item.id);
    if (index >= 0) telemetry.requests[index] = item;
    else telemetry.requests.unshift(item);
  }
  for (const item of [...(delta.operations ?? [])].reverse()) {
    const index = telemetry.operations.findIndex((current) => current.id === item.id);
    if (index >= 0) telemetry.operations[index] = item;
    else telemetry.operations.unshift(item);
  }
  return telemetry;
}

async function connectPlugin(
  port: number,
  instanceId: string,
  opts: { fileKey?: string; fileName?: string; pageId?: string; pageName?: string; clientId?: string; runtimeSdks?: string[]; bundleRevision?: string } = {},
): Promise<FakePlugin> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(ws);
  const requests: BridgeRequest[] = [];
  const messages: WireMessage[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.on("message", (raw, isBinary) => {
    if (isBinary) return;
    const msg = JSON.parse(raw.toString()) as WireMessage;
    messages.push(msg);
    if (msg.type === "request") requests.push(msg.payload);
  });
  ws.send(JSON.stringify({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    pluginVersion: "0.5.6-test",
    bundleRevision: opts.bundleRevision ?? "dev",
    runtimeSdks: opts.runtimeSdks ?? ["v1", "v2"],
    instanceId,
    clientId: opts.clientId ?? "client-installation-a",
    fileKey: opts.fileKey ?? "same-file-key",
    fileName: opts.fileName ?? "Shared File",
    pageId: opts.pageId ?? "0:1",
    pageName: opts.pageName ?? "Page 1",
    pages: [
      { id: "0:1", name: "Page 1" },
      { id: "0:2", name: "Page 2" },
    ],
    editorType: "figma",
  }));
  await waitUntil(() => requests.length >= 0 && true, 15);
  return {
    ws,
    requests,
    messages,
    sendResponse(id, result) {
      ws.send(JSON.stringify({ type: "response", payload: { id, ok: true, result } }));
    },
    sendFailure(id, code = ErrorCode.SANDBOX_ERROR) {
      ws.send(JSON.stringify({ type: "response", payload: { id, ok: false, error: { code, message: "Synthetic plugin failure" } } }));
    },
    latestTelemetry() {
      let latest: InstanceTelemetryWire | undefined;
      for (const msg of messages) {
        if (msg?.type === "instances" && msg.telemetry) {
          latest = {
            ...msg.telemetry,
            requests: msg.telemetry.requests.map((item) => ({ ...item })),
            operations: msg.telemetry.operations.map((item) => ({ ...item })),
          };
          continue;
        }
        if (latest && msg.type === "telemetry_delta") latest = applyTelemetryDeltaForTest(latest, msg);
      }
      return latest;
    },
  };
}


async function postRpc(port: number, body: Record<string, unknown>): Promise<{ status: number; json: any }> {
  return await new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path: "/rpc",
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload)),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function waitUntil(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("Bridge native instance routing", () => {
  it("fails immediately when no Figma instance is connected", async () => {
    const { bridge } = await startBridge();
    await expect(bridge.dispatch("execute_js", { code: "return 1" })).rejects.toMatchObject({ code: ErrorCode.NOT_CONNECTED });
  });

  it("keeps two plugin instances for the same file and requires an explicit target", async () => {
    const { bridge, port } = await startBridge();
    await connectPlugin(port, "instance-window-a");
    await connectPlugin(port, "instance-window-b");
    await waitUntil(() => bridge.instanceCount === 2);

    expect(bridge.instanceSummaries()).toHaveLength(2);
    expect(new Set(bridge.instanceSummaries().map((item) => item.fileKey))).toEqual(new Set(["same-file-key"]));
    await expect(bridge.dispatch("execute_js", { code: "return 1" })).rejects.toMatchObject({ code: ErrorCode.AMBIGUOUS_TARGET });
  });

  it("routes by instance id and carries a deterministic page target", async () => {
    const { bridge, port } = await startBridge();
    const a = await connectPlugin(port, "instance-window-a");
    const b = await connectPlugin(port, "instance-window-b");
    await waitUntil(() => bridge.instanceCount === 2);

    const call = bridge.dispatch("execute_js", { code: "return figma.currentPage.name" }, { instanceId: "instance-window-b", pageId: "0:2" });
    await waitUntil(() => b.requests.length === 1);
    expect(a.requests).toHaveLength(0);
    expect(b.requests[0]?.targetPageId).toBe("0:2");
    b.sendResponse(b.requests[0]!.id, { page: "Page 2" });
    await expect(call).resolves.toMatchObject({ ok: true, result: { page: "Page 2" } });
  });

  it("keeps peer-window runtime load current while the target receives its telemetry delta", async () => {
    const { bridge, port } = await startBridge();
    const a = await connectPlugin(port, "instance-window-a");
    const b = await connectPlugin(port, "instance-window-b");
    await waitUntil(() => bridge.instanceCount === 2);

    const call = bridge.dispatch("execute_js", { code: "return 1" }, { instanceId: "instance-window-b" });
    await waitUntil(() => b.requests.length === 1);
    await waitUntil(() => a.messages.some((msg) => msg.type === "instances"
      && msg.instances.some((instance) => instance.instanceId === "instance-window-b" && instance.inFlight === 1)));
    b.sendResponse(b.requests[0]!.id, 1);
    await expect(call).resolves.toMatchObject({ ok: true, result: 1 });
  });

  it("rejects an SDK request before queueing when the loaded companion bundle is stale", async () => {
    const { bridge, port } = await startBridge();
    const stale = await connectPlugin(port, "instance-stale-sdk", { runtimeSdks: [] });
    await waitUntil(() => bridge.instanceCount === 1);

    expect(bridge.instanceSummaries()[0]?.runtimeSdks).toEqual([]);
    await expect(bridge.dispatch(
      "execute_js",
      { code: "return figmaPlugin.version", runtimeSdk: "v2" },
      { instanceId: "instance-stale-sdk" },
    )).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_OPERATION,
      message: expect.stringContaining('does not advertise runtimeSdk "v2"'),
      hint: expect.stringContaining("Reload Figma Plugin"),
    });
    expect(stale.requests).toHaveLength(0);
    expect(bridge.queueLength).toBe(0);
  });

  it("rejects a same-version v2 companion when its exact bundle revision is stale", async () => {
    const { bridge, port } = await startBridge();
    const stale = await connectPlugin(port, "instance-stale-revision", { runtimeSdks: ["v2"], bundleRevision: "stale-revision" });
    await waitUntil(() => bridge.instanceCount === 1);

    await expect(bridge.dispatch(
      "execute_js",
      { code: "return figmaPlugin.version", runtimeSdk: "v2" },
      { instanceId: "instance-stale-revision" },
    )).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_OPERATION,
      message: expect.stringContaining("bundle revision"),
      hint: expect.stringContaining("same bundle revision"),
    });
    expect(stale.requests).toHaveLength(0);
    expect(bridge.queueLength).toBe(0);
  });

  it("uses session binding instead of guessing between windows", async () => {
    const { bridge, port } = await startBridge();
    const a = await connectPlugin(port, "instance-window-a");
    const b = await connectPlugin(port, "instance-window-b");
    await waitUntil(() => bridge.instanceCount === 2);
    b.ws.send(JSON.stringify({ type: "bind", sessionId: "agent-test" }));
    await waitUntil(() => bridge.sessionBinding("agent-test") === "instance-window-b");

    const call = bridge.dispatch("execute_js", { code: "return 2" }, { sessionId: "agent-test" });
    await waitUntil(() => b.requests.length === 1);
    expect(a.requests).toHaveLength(0);
    b.sendResponse(b.requests[0]!.id, 2);
    const result = await call;
    expect(result.ok).toBe(true);
    expect(result.warnings?.join(" ")).toContain("bound to Figma instance");
  });

  it("counts queue wait inside the total deadline", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);

    const first = bridge.dispatch("execute_js", { code: "return 'slow'" }, { timeoutMs: 120 });
    const firstFailure = first.then(() => null, (error: unknown) => error);
    await waitUntil(() => plugin.requests.length === 1);
    const second = bridge.dispatch("execute_js", { code: "return 'queued'" }, { timeoutMs: 30 });
    await expect(second).rejects.toMatchObject({ code: ErrorCode.PLUGIN_TIMEOUT });
    await expect(firstFailure).resolves.toMatchObject({ code: ErrorCode.PLUGIN_TIMEOUT });
    expect(bridge.queueLength).toBe(0);
    expect(bridge.pendingCount).toBe(0);
  });

  it("clears only queued work", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);

    const first = bridge.dispatch("execute_js", { code: "return 'running'" }, { timeoutMs: 300 });
    await waitUntil(() => plugin.requests.length === 1);
    const second = bridge.dispatch("execute_js", { code: "return 'queued'" }, { timeoutMs: 300 });
    await waitUntil(() => bridge.queueLength === 1);
    plugin.ws.send(JSON.stringify({ type: "clear_queue" }));
    await expect(second).rejects.toMatchObject({ code: ErrorCode.CANCELLED });

    plugin.sendResponse(plugin.requests[0]!.id, "running");
    await expect(first).resolves.toMatchObject({ ok: true, result: "running" });
  });

  it("rejects a different local client id after trust is established", async () => {
    const { bridge, port } = await startBridge();
    await connectPlugin(port, "instance-window-a", { clientId: "client-installation-a" });
    await waitUntil(() => bridge.instanceCount === 1);

    const other = await connectPlugin(port, "instance-window-b", { clientId: "client-installation-b" });
    if (other.ws.readyState !== WebSocket.CLOSED) {
      await new Promise<void>((resolve) => other.ws.once("close", () => resolve()));
    }
    expect(bridge.instanceCount).toBe(1);
  });

  it("records semantic request kind, lifecycle, timing, and cumulative metrics for the companion UI", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);

    const call = bridge.dispatch("execute_js", {
      code: "// @controlmux read Inspect selected nodes\nreturn figma.currentPage.selection.length",
    }, { sessionId: "agent-telemetry" });
    await waitUntil(() => plugin.requests.length === 1);
    await waitUntil(() => plugin.latestTelemetry()?.requests[0]?.status === "running");

    const running = plugin.latestTelemetry()!;
    expect(running.metrics.totalCount).toBe(1);
    expect(running.metrics.requestKinds).toMatchObject({ read: 1, write: 0, export: 0, other: 0 });
    expect(running.requests[0]).toMatchObject({
      kind: "read",
      label: "Inspect selected nodes",
      status: "running",
      sessionId: "agent-telemetry",
    });

    plugin.sendResponse(plugin.requests[0]!.id, 2);
    await expect(call).resolves.toMatchObject({ ok: true, result: 2 });
    await waitUntil(() => plugin.latestTelemetry()?.requests[0]?.status === "success");

    const done = plugin.latestTelemetry()!;
    expect(done.metrics.successCount).toBe(1);
    expect(done.metrics.errorCount).toBe(0);
    expect(done.metrics.samples).toBe(1);
    expect(done.requests[0]?.totalMs).toBeTypeOf("number");
    expect(done.requests[0]?.executionMs).toBeTypeOf("number");
  });

  it("sends one full telemetry snapshot, then compact deltas, with explicit resync recovery", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);
    await waitUntil(() => plugin.messages.some((msg) => msg.type === "instances" && !!msg.telemetry));

    const initialFullCount = plugin.messages.filter((msg) => msg.type === "instances" && !!msg.telemetry).length;
    const initialInstanceUpdateCount = plugin.messages.filter((msg) => msg.type === "instances").length;
    const call = bridge.dispatch("execute_js", { code: "// @controlmux read Inspect delta\nreturn 1" });
    await waitUntil(() => plugin.requests.length === 1);
    await waitUntil(() => plugin.latestTelemetry()?.requests[0]?.status === "running");
    plugin.sendResponse(plugin.requests[0]!.id, 1);
    await expect(call).resolves.toMatchObject({ ok: true, result: 1 });
    await waitUntil(() => plugin.latestTelemetry()?.requests[0]?.status === "success");

    const deltas = plugin.messages.filter((msg): msg is TelemetryDelta => msg.type === "telemetry_delta");
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    expect(deltas.every((delta) => delta.self === "instance-window-a")).toBe(true);
    expect(deltas.map((delta) => delta.seq)).toEqual(deltas.map((_, index) => index + 1));
    expect(deltas.some((delta) => delta.requests?.some((request) => request.status === "running"))).toBe(true);
    expect(deltas.some((delta) => delta.operations?.some((operation) => operation.status === "success"))).toBe(true);
    expect(deltas.some((delta) => delta.runtime.inFlight === 1 && delta.runtime.pendingCount === 1)).toBe(true);
    expect(deltas.at(-1)?.runtime).toEqual({ queueLength: 0, pendingCount: 0, inFlight: 0 });
    expect(plugin.messages.filter((msg) => msg.type === "instances" && !!msg.telemetry).length).toBe(initialFullCount);
    expect(plugin.messages.filter((msg) => msg.type === "instances").length).toBe(initialInstanceUpdateCount);

    plugin.ws.send(JSON.stringify({ type: "telemetry_resync" }));
    await waitUntil(() => plugin.messages.filter((msg) => msg.type === "instances" && !!msg.telemetry).length === initialFullCount + 1);
    const resynced = plugin.latestTelemetry()!;
    expect(resynced.requests[0]?.status).toBe("success");
    expect(resynced.metrics.successCount).toBe(1);
  });

  it("coalesces a sub-frame request lifecycle into one final telemetry delta", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);
    await waitUntil(() => plugin.messages.some((msg) => msg.type === "instances" && !!msg.telemetry));
    const before = plugin.messages.filter((msg) => msg.type === "telemetry_delta").length;
    const respondImmediately = (raw: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString()) as WireMessage;
      if (msg.type === "request") plugin.sendResponse(msg.payload.id, 1);
    };
    plugin.ws.on("message", respondImmediately);

    const call = bridge.dispatch("execute_js", { code: "return 1" });
    await expect(call).resolves.toMatchObject({ ok: true, result: 1 });
    plugin.ws.off("message", respondImmediately);
    await waitUntil(() => plugin.latestTelemetry()?.requests[0]?.status === "success");
    await new Promise((resolve) => setTimeout(resolve, 30));

    const deltas = plugin.messages.filter((msg): msg is TelemetryDelta => msg.type === "telemetry_delta").slice(before);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.requests?.[0]?.status).toBe("success");
    expect(deltas[0]?.runtime).toEqual({ queueLength: 0, pendingCount: 0, inFlight: 0 });
  });

  it("keeps unannotated executions honest as Other and records plugin failures", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);

    const call = bridge.dispatch("execute_js", { code: "throw new Error('boom')" });
    await waitUntil(() => plugin.requests.length === 1);
    plugin.sendFailure(plugin.requests[0]!.id);
    const response = await call;
    expect(response.ok).toBe(false);
    await waitUntil(() => plugin.latestTelemetry()?.requests[0]?.status === "failed");

    const telemetry = plugin.latestTelemetry()!;
    expect(telemetry.metrics.totalCount).toBe(1);
    expect(telemetry.metrics.failureCount).toBe(1);
    expect(telemetry.metrics.requestKinds.other).toBe(1);
    expect(telemetry.requests[0]).toMatchObject({ kind: "other", label: "Unlabeled figma_exec", status: "failed", errorCode: ErrorCode.SANDBOX_ERROR });
  });

  it("clears recent request history without resetting aggregate counters", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);

    const call = bridge.dispatch("execute_js", { code: "// @controlmux write Rename frame\nreturn 1" });
    await waitUntil(() => plugin.requests.length === 1);
    plugin.sendResponse(plugin.requests[0]!.id, 1);
    await call;
    await waitUntil(() => plugin.latestTelemetry()?.requests[0]?.status === "success");
    expect(plugin.latestTelemetry()?.metrics.totalCount).toBe(1);

    plugin.ws.send(JSON.stringify({ type: "clear_request_log" }));
    await waitUntil(() => plugin.latestTelemetry()?.requests.length === 0);
    const afterClear = plugin.latestTelemetry()!;
    expect(afterClear.metrics.totalCount).toBe(1);
    expect(afterClear.metrics.successCount).toBe(1);
    expect(afterClear.metrics.requestKinds.write).toBe(1);
  });

  it("authenticates health and binds it to the expected ControlMux runtime identity", async () => {
    const { port } = await startBridge();
    const info = { port, token: "test-token", pid: process.pid, startedAt: Date.now(), version: VERSION };
    await expect(Follower.checkHealth(info)).resolves.toBe(true);
    await expect(Follower.checkHealth({ ...info, token: "wrong-token" })).resolves.toBe(false);
    await expect(Follower.checkHealth({ ...info, version: "0.0.0-wrong" })).resolves.toBe(false);
  });

  it("closes a plugin socket that sends a malformed wire message", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);
    const closed = new Promise<number>((resolve) => plugin.ws.once("close", (code) => resolve(code)));
    plugin.ws.send(JSON.stringify({ type: "response", payload: { id: "request-123", ok: "yes" } }));
    await expect(closed).resolves.toBe(1008);
    await waitUntil(() => bridge.instanceCount === 0);
  });

  it("does not dispatch queued work while a timed-out Figma execution may still be running", async () => {
    const { bridge, port } = await startBridge();
    const plugin = await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);

    const first = bridge.dispatch("execute_js", { code: "return 'slow'" }, { timeoutMs: 30 });
    const firstFailure = first.then(() => null, (error: unknown) => error);
    await waitUntil(() => plugin.requests.length === 1);
    const firstId = plugin.requests[0]!.id;
    expect(await firstFailure).toMatchObject({ code: ErrorCode.PLUGIN_TIMEOUT });

    const second = bridge.dispatch("execute_js", { code: "return 'next'" }, { timeoutMs: 250 });
    const secondOutcome = second.then((result) => ({ result }), (error: unknown) => ({ error }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(plugin.requests).toHaveLength(1);
    expect(bridge.instanceSummaries()[0]?.inFlight).toBe(1);
    expect(bridge.queueLength).toBe(1);

    plugin.sendResponse(firstId, "late");
    await waitUntil(() => plugin.requests.length === 2);
    plugin.sendResponse(plugin.requests[1]!.id, "next");
    expect(await secondOutcome).toEqual({ result: expect.objectContaining({ ok: true, result: "next" }) });
  });


  it("preserves runtime error codes across the leader HTTP RPC envelope", async () => {
    const bridge = new Bridge({
      onRpc: async () => {
        throw new OpError(ErrorCode.AMBIGUOUS_TARGET, "Choose a Figma instance.");
      },
    });
    bridges.push(bridge);
    const port = await freePort();
    await bridge.listen(port, "test-token");

    const response = await postRpc(port, { op: "execute_js", params: { code: "return 1" } });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ ok: false, error: { code: ErrorCode.AMBIGUOUS_TARGET } });
  });

  it("returns TARGET_NOT_FOUND for a stale explicit instance", async () => {
    const { bridge, port } = await startBridge();
    await connectPlugin(port, "instance-window-a");
    await waitUntil(() => bridge.instanceCount === 1);
    await expect(bridge.dispatch("execute_js", { code: "return 1" }, { instanceId: "instance-missing" })).rejects.toMatchObject({
      code: ErrorCode.TARGET_NOT_FOUND,
    } satisfies Partial<OpError>);
  });
});

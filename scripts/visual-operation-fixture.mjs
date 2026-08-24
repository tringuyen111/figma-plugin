import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uiPath = resolve(root, "plugin", "ui.html");
const httpPort = Number(process.env.FIGMA_UI_FIXTURE_HTTP_PORT || 8123);
const wsPort = Number(process.env.FIGMA_UI_FIXTURE_WS_PORT || 39470);
const instanceId = "synthetic-operation-fixture";

const ui = await readFile(uiPath, "utf8");
const fixtureBootstrap = `
<style>
#syntheticFixtureBadge{position:fixed;z-index:20;top:4px;left:50%;transform:translateX(-50%);padding:3px 8px;border-radius:999px;background:#7a5100;color:#fff;font:700 8px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.08em;pointer-events:none}
</style>
<div id="syntheticFixtureBadge">SYNTHETIC FIXTURE</div>
<script>
window.__SYNTHETIC_OPERATION_FIXTURE__ = true;
setTimeout(function () {
  window.postMessage({ pluginMessage: { kind: "handshake", protocolVersion: 10, pluginVersion: "0.7.0" } }, "*");
  window.postMessage({ pluginMessage: { kind: "hello", hello: {
    protocolVersion: 10,
    pluginVersion: "0.5.6",
    bundleRevision: "fixture",
    runtimeSdks: ["v1", "v2"],
    instanceId: "${instanceId}",
    clientId: "synthetic-client",
    fileKey: "synthetic-file",
    fileName: "Checkout exploration",
    pageId: "page-checkout",
    pageName: "Checkout",
    pages: [{ id: "page-checkout", name: "Checkout" }],
    editorType: "figma"
  } } }, "*");
}, 20);
</script>`;
const fixtureUi = ui
  .replace("var DEFAULT_PORT = 38470;", `var DEFAULT_PORT = ${wsPort};`)
  .replace("</body>", `${fixtureBootstrap}</body>`);

const httpServer = createServer((request, response) => {
  if (request.url !== "/" && request.url !== "/plugin/ui.html") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(fixtureUi);
});

const wsServer = new WebSocketServer({ host: "::1", port: wsPort, path: "/ws" });
wsServer.on("connection", (socket) => {
  socket.on("message", (raw, binary) => {
    if (binary) return;
    let message;
    try { message = JSON.parse(raw.toString("utf8")); } catch { return; }
    if (message.type === "hello") {
      socket.send(JSON.stringify({ type: "assigned", instanceId }));
      socket.send(JSON.stringify(instanceSnapshot()));
    } else if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
    } else if (message.type === "clear_request_log") {
      const snapshot = instanceSnapshot();
      snapshot.telemetry.requests = [];
      snapshot.telemetry.operations = [];
      socket.send(JSON.stringify(snapshot));
    }
  });
});

httpServer.listen(httpPort, "127.0.0.1", () => {
  process.stdout.write(`Synthetic operation fixture: http://127.0.0.1:${httpPort}/plugin/ui.html\n`);
});

function instanceSnapshot() {
  const now = Date.now();
  const firstStarted = now - 8350;
  const retryStarted = now - 4120;
  const inspectStarted = now - 1760;
  const requests = [
    {
      id: "request-inspect-1",
      kind: "read",
      label: "Inspect checkout hierarchy",
      status: "running",
      enqueuedAt: inspectStarted,
      startedAt: inspectStarted + 35,
      queueMs: 35,
      executionMs: 1725,
      requestBytes: 846,
      responseBytes: 0,
      capability: "figma-layout",
      traceId: "checkout:inspect-hierarchy",
      attempt: 1,
      operationPhase: "inspect",
      operationPlanId: "checkout-system-refresh",
      operationStepId: "inspect-hierarchy",
      operationRepresentation: "tree",
      operationTarget: "Checkout / Main",
      postconditions: ["Selection hierarchy is captured with node ids"]
    },
    {
      id: "request-button-2",
      kind: "write",
      label: "Reuse primary Button",
      status: "success",
      enqueuedAt: retryStarted,
      startedAt: retryStarted + 42,
      finishedAt: retryStarted + 884,
      queueMs: 42,
      executionMs: 842,
      totalMs: 884,
      requestBytes: 1320,
      responseBytes: 228,
      capability: "figma-components",
      traceId: "checkout:primary-button",
      attempt: 2,
      operationPhase: "verify",
      operationPlanId: "checkout-system-refresh",
      operationStepId: "reuse-primary-button",
      operationRepresentation: "component-specimen",
      operationTarget: "Checkout / Primary action",
      postconditions: ["Node is an instance", "Main component key matches registry"]
    },
    {
      id: "request-button-1",
      kind: "write",
      label: "Reuse primary Button",
      status: "failed",
      enqueuedAt: firstStarted,
      startedAt: firstStarted + 18,
      finishedAt: firstStarted + 610,
      queueMs: 18,
      executionMs: 592,
      totalMs: 610,
      requestBytes: 1268,
      responseBytes: 94,
      capability: "figma-components",
      traceId: "checkout:primary-button",
      attempt: 1,
      operationPhase: "execute",
      operationPlanId: "checkout-system-refresh",
      operationStepId: "reuse-primary-button",
      operationRepresentation: "component-specimen",
      operationTarget: "Checkout / Primary action",
      postconditions: ["Node is an instance", "Main component key matches registry"],
      errorCode: "COMPONENT_NOT_FOUND"
    }
  ];
  const operations = [
    {
      id: "checkout:inspect-hierarchy",
      label: "Inspect checkout hierarchy",
      kind: "read",
      status: "running",
      startedAt: inspectStarted,
      requestCount: 1,
      attemptCount: 1,
      requestIds: ["request-inspect-1"],
      capability: "figma-layout",
      phase: "inspect",
      planId: "checkout-system-refresh",
      stepId: "inspect-hierarchy",
      representation: "tree",
      target: "Checkout / Main",
      postconditions: ["Selection hierarchy is captured with node ids"]
    },
    {
      id: "checkout:primary-button",
      label: "Reuse primary Button",
      kind: "write",
      status: "success",
      startedAt: firstStarted,
      finishedAt: retryStarted + 884,
      totalMs: retryStarted + 884 - firstStarted,
      requestCount: 2,
      attemptCount: 2,
      requestIds: ["request-button-2", "request-button-1"],
      capability: "figma-components",
      phase: "verify",
      planId: "checkout-system-refresh",
      stepId: "reuse-primary-button",
      representation: "component-specimen",
      target: "Checkout / Primary action",
      postconditions: ["Node is an instance", "Main component key matches registry"]
    }
  ];
  const metrics = {
    samples: 2,
    totalCount: 3,
    successCount: 1,
    failureCount: 1,
    timeoutCount: 0,
    cancelledCount: 0,
    requestKinds: { read: 1, write: 2, export: 0, other: 0 },
    lastTotalMs: 884,
    p50TotalMs: 610,
    p95TotalMs: 884,
    lastQueueMs: 42,
    p50QueueMs: 18,
    p95QueueMs: 42,
    lastExecutionMs: 842,
    p95ExecutionMs: 842,
    errorCount: 1,
    attributedCount: 3,
    retryCount: 1,
    requestBytes: 3434,
    responseBytes: 322
  };
  return {
    type: "instances",
    instances: [{
      instanceId,
      fileKey: "synthetic-file",
      fileName: "Checkout exploration",
      pageId: "page-checkout",
      pageName: "Checkout",
      editorType: "figma",
      connectedAt: now - 72500,
      lastHeartbeatMs: 12,
      inFlight: 1,
      queueLength: 0,
      metrics
    }],
    sessions: [{ sessionId: "synthetic-agent", instanceId }],
    telemetry: { metrics, requests, operations, historyLimit: 100 }
  };
}

function close() {
  wsServer.close();
  httpServer.close(() => process.exit(0));
}
process.on("SIGINT", close);
process.on("SIGTERM", close);

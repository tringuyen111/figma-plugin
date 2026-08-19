(function () {
  "use strict";
  var DEFAULT_PORT = 38470;
  var PORT_RANGE = 10;
  var HEARTBEAT_INTERVAL_MS = 10000;
  var HEARTBEAT_DEAD_MS = 30000;
  var BACKOFF_MIN = 350;
  var BACKOFF_MAX = 4000;
  var LOG_RENDER_BATCH = 24;
  var LOG_RENDER_DEBOUNCE_MS = 80;
  var TELEMETRY_RENDER_DEBOUNCE_MS = 32;

  var state = {
    phase: "searching",
    ws: null,
    portIndex: 0,
    connectedPort: null,
    reconnectTimer: null,
    heartbeatTimer: null,
    lastHeartbeatAt: 0,
    connectedAt: null,
    everConnected: false,
    reconnects: 0,
    backoff: BACKOFF_MIN,
    generation: 0,
    handshake: null,
    hello: null,
    selfInstanceId: null,
    snapshot: null,
    telemetry: null,
    telemetrySeq: null,
    telemetryResyncPending: false,
    telemetryRenderTimer: null,
    logRenderTimer: null,
    logRenderLimit: LOG_RENDER_BATCH,
    paused: false,
    filter: "all",
    displayedOperations: [],
    displayedRequests: [],
    pendingNew: 0
  };

  var el = {};
  [
    "fileContext", "livePill", "liveText", "systemButton", "connectionButton", "connectionIcon", "connectionTitle", "connectionNote",
    "lastSignal", "connectedFor", "agentPresence", "recovery", "retryButton", "requestTotal", "currentLoad", "currentLoadNote",
    "reliabilityValue", "reliabilityNote", "speedValue", "speedNote", "mixRead", "mixWrite", "mixExport", "mixOther", "mixLabels",
    "logState", "pauseButton", "pauseIcon", "filterButton", "filterTray", "clearButton", "newButton", "logScroll", "requestList", "logCount",
    "connectionSheet", "systemSheet", "requestSheet", "clearSheet", "detailConnectionStatus", "detailLastSignal", "detailConnectedFor",
    "detailAgents", "detailReconnects", "detailEndpoint", "detailVersion", "detailProtocol", "detailBundleRevision", "detailRuntimeSdk", "detailRetention", "detailTraffic", "requestDetailBody",
    "confirmClear"
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  function toMain(message) { parent.postMessage({ pluginMessage: message }, "*"); }
  function currentPort() { return DEFAULT_PORT + (state.portIndex % PORT_RANGE); }
  function selfSnapshot() {
    if (!state.snapshot || !Array.isArray(state.snapshot.instances)) return null;
    return state.snapshot.instances.find(function (item) { return item.instanceId === state.selfInstanceId; }) || null;
  }
  function sessions() { return state.snapshot && Array.isArray(state.snapshot.sessions) ? state.snapshot.sessions : []; }
  function metrics() {
    if (state.telemetry && state.telemetry.metrics) return state.telemetry.metrics;
    var self = selfSnapshot();
    return self && self.metrics ? self.metrics : null;
  }
  function requestLog() { return state.telemetry && Array.isArray(state.telemetry.requests) ? state.telemetry.requests : []; }
  function operationLog() {
    if (state.telemetry && Array.isArray(state.telemetry.operations)) return state.telemetry.operations;
    return requestLog().map(function (item) {
      return {
        id: item.traceId || item.id,
        label: item.label,
        kind: item.kind,
        status: item.status,
        startedAt: item.enqueuedAt,
        finishedAt: item.finishedAt,
        totalMs: item.totalMs,
        requestCount: 1,
        attemptCount: item.attempt || 1,
        requestIds: [item.id],
        capability: item.capability,
        phase: item.operationPhase,
        planId: item.operationPlanId,
        stepId: item.operationStepId,
        representation: item.operationRepresentation,
        target: item.operationTarget,
        postconditions: item.postconditions,
        errorCode: item.errorCode
      };
    });
  }
  function fmtMs(value) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1) + " s";
    return Math.max(0, Math.round(value)) + " ms";
  }
  function fmtBytes(value) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    if (value < 1024) return Math.round(value) + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10 * 1024 ? 1 : 0) + " KB";
    return (value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }
  function fmtDuration(value) {
    if (typeof value !== "number" || !isFinite(value) || value < 0) return "—";
    var seconds = Math.floor(value / 1000);
    if (seconds < 60) return seconds + "s";
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + "m " + (seconds % 60) + "s";
    var hours = Math.floor(minutes / 60);
    return hours + "h " + (minutes % 60) + "m";
  }
  function fmtAgo(ms) {
    if (typeof ms !== "number" || !isFinite(ms)) return "—";
    if (ms < 1500) return "Just now";
    if (ms < 60000) return Math.max(1, Math.round(ms / 1000)) + "s ago";
    return Math.max(1, Math.round(ms / 60000)) + "m ago";
  }
  function fmtClock(epoch) {
    if (typeof epoch !== "number" || !isFinite(epoch)) return "—";
    var date = new Date(epoch);
    return [date.getHours(), date.getMinutes(), date.getSeconds()].map(function (n) { return String(n).padStart(2, "0"); }).join(":");
  }
  function shortSession(id) {
    if (!id) return "—";
    return id.length <= 18 ? id : id.slice(0, 8) + "…" + id.slice(-5);
  }
  function shortTrace(id) {
    if (!id) return "—";
    return id.length <= 24 ? id : id.slice(0, 12) + "…" + id.slice(-7);
  }
  function sourceLabel(item) {
    return item && item.capability ? item.capability : "unattributed";
  }
  function kindLabel(kind) {
    if (kind === "read") return "READ";
    if (kind === "write") return "WRITE";
    if (kind === "export") return "EXPORT";
    return "OTHER";
  }
  function kindIcon(kind) {
    if (kind === "read") return "#i-eye";
    if (kind === "write") return "#i-edit";
    if (kind === "export") return "#i-export";
    return "#i-code";
  }
  function statusLabel(status) {
    if (status === "success") return "✓ Success";
    if (status === "failed") return "× Failed";
    if (status === "timeout") return "× Timed out";
    if (status === "cancelled") return "— Cancelled";
    if (status === "running") return "● Running";
    return "… Queued";
  }
  function statusGlyph(status) {
    if (status === "success") return "✓";
    if (status === "failed") return "×";
    if (status === "timeout") return "⏱";
    if (status === "running") return "●";
    if (status === "cancelled") return "—";
    return "…";
  }
  function isProblem(item) { return item.status === "failed" || item.status === "timeout"; }

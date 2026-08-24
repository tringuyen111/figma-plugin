  function setPhase(phase) {
    state.phase = phase;
    renderConnection();
    renderRequests();
  }

  function sendHello() {
    if (!state.ws || state.ws.readyState !== 1 || !state.hello) return;
    state.ws.send(JSON.stringify({
      type: "hello",
      protocolVersion: state.handshake && state.handshake.protocolVersion || state.hello.protocolVersion || 1,
      pluginVersion: state.handshake && state.handshake.pluginVersion || state.hello.pluginVersion || "0.0.0",
      bundleRevision: state.hello.bundleRevision || "unknown",
      runtimeSdks: Array.isArray(state.hello.runtimeSdks) ? state.hello.runtimeSdks : [],
      features: state.hello.features || undefined,
      sync: state.hello.sync || undefined,
      instanceId: state.hello.instanceId,
      clientId: state.hello.clientId,
      fileKey: state.hello.fileKey == null ? null : state.hello.fileKey,
      fileName: state.hello.fileName || "",
      pageId: state.hello.pageId || "",
      pageName: state.hello.pageName || "",
      pages: state.hello.pages || [],
      editorType: state.hello.editorType || "figma"
    }));
  }

  function requestTelemetryResync() {
    if (state.telemetryResyncPending || !state.ws || state.ws.readyState !== 1) return;
    state.telemetryResyncPending = true;
    state.ws.send(JSON.stringify({ type: "telemetry_resync" }));
  }

  function sendBinary(message) {
    if (!state.ws || state.ws.readyState !== 1) return;
    var bytes = message.bytes instanceof Uint8Array ? message.bytes : new Uint8Array(message.bytes);
    var header = { type: "binary_response", id: message.id, ok: true, format: message.format, byteLength: bytes.byteLength, metadata: message.metadata || {} };
    if (message.warnings && message.warnings.length) header.warnings = message.warnings;
    var headerBytes = new TextEncoder().encode(JSON.stringify(header));
    var frame = new Uint8Array(4 + headerBytes.byteLength + bytes.byteLength);
    new DataView(frame.buffer).setUint32(0, headerBytes.byteLength, false);
    frame.set(headerBytes, 4);
    frame.set(bytes, 4 + headerBytes.byteLength);
    state.ws.send(frame.buffer);
  }

  function startHeartbeat() {
    stopHeartbeat();
    state.heartbeatTimer = setInterval(function () {
      if (!state.ws || state.ws.readyState !== 1) return;
      if (Date.now() - state.lastHeartbeatAt > HEARTBEAT_DEAD_MS) {
        try { state.ws.close(); } catch (_) {}
        return;
      }
      state.ws.send(JSON.stringify({ type: "ping", at: Date.now() }));
    }, HEARTBEAT_INTERVAL_MS);
  }
  function stopHeartbeat() { if (state.heartbeatTimer) clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    state.portIndex = (state.portIndex + 1) % PORT_RANGE;
    var wait = state.backoff;
    state.backoff = Math.min(state.backoff * 2, BACKOFF_MAX);
    state.reconnectTimer = setTimeout(connect, wait);
  }
  function markDisconnected() {
    state.connectedPort = null;
    state.selfInstanceId = null;
    state.snapshot = null;
    state.telemetry = null;
    state.telemetrySeq = null;
    state.telemetryResyncPending = false;
    if (state.telemetryRenderTimer) clearTimeout(state.telemetryRenderTimer);
    state.telemetryRenderTimer = null;
    setPhase("disconnected");
  }
  function connect() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    state.generation++;
    var mine = state.generation;
    var port = currentPort();
    setPhase("searching");
    try { state.ws = new WebSocket("ws://localhost:" + port + "/ws"); }
    catch (_) { markDisconnected(); scheduleReconnect(); return; }
    state.ws.binaryType = "arraybuffer";
    state.ws.onopen = function () {
      if (state.generation !== mine) return;
      state.connectedPort = port;
      state.backoff = BACKOFF_MIN;
      state.lastHeartbeatAt = Date.now();
      setPhase("handshake");
      sendHello();
      startHeartbeat();
    };
    state.ws.onmessage = function (event) {
      if (state.generation !== mine || typeof event.data !== "string") return;
      var data;
      try { data = JSON.parse(event.data); } catch (_) { return; }
      if (data.type === "ping") { state.lastHeartbeatAt = Date.now(); state.ws.send(JSON.stringify({ type: "pong", at: Date.now() })); renderConnection(); return; }
      if (data.type === "pong") { state.lastHeartbeatAt = Date.now(); renderConnection(); return; }
      if (data.type === "request" && data.payload) { toMain({ kind: "request", payload: data.payload }); return; }
      if (data.type === "assigned" && data.instanceId) {
        state.selfInstanceId = data.instanceId;
        if (state.everConnected) state.reconnects++;
        state.everConnected = true;
        state.connectedAt = Date.now();
        setPhase("ready");
        return;
      }
      if (data.type === "instances") {
        state.snapshot = data;
        state.lastHeartbeatAt = Date.now();
        if (data.telemetry) applyTelemetry(data.telemetry, data.telemetrySeq);
        else if (!state.telemetry || (typeof data.telemetrySeq === "number" && data.telemetrySeq !== state.telemetrySeq)) requestTelemetryResync();
        renderConnection();
      }
      if (data.type === "telemetry_delta") {
        state.lastHeartbeatAt = Date.now();
        applyTelemetryDelta(data);
        renderConnection();
      }
    };
    state.ws.onerror = function () {};
    state.ws.onclose = function () {
      if (state.generation !== mine) return;
      stopHeartbeat();
      state.ws = null;
      markDisconnected();
      scheduleReconnect();
    };
  }
  function reconnectNow() {
    state.backoff = BACKOFF_MIN;
    state.portIndex = 0;
    if (state.ws) { try { state.ws.close(); } catch (_) {} }
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    connect();
  }

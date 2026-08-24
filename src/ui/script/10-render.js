  function renderContext() {
    var hello = state.hello;
    if (!hello) { el.fileContext.textContent = "Waiting for Figma…"; return; }
    var file = hello.fileName || "Untitled";
    var page = hello.pageName || "No page";
    el.fileContext.textContent = file + " · " + page;
    el.fileContext.title = file + " · " + page;
  }

  function renderConnection() {
    var self = selfSnapshot();
    var phase = state.phase;
    var ready = phase === "ready";
    var connecting = phase === "searching" || phase === "handshake";
    var sdkReady = Boolean(self && Array.isArray(self.runtimeSdks) && self.runtimeSdks.indexOf("v2") >= 0);
    el.livePill.className = "live-pill " + (ready ? "" : connecting ? "connecting" : "offline");
    el.liveText.textContent = ready ? "LIVE" : connecting ? "LINKING" : "OFFLINE";
    el.connectionIcon.className = "connection-icon " + (ready ? "" : connecting ? "connecting" : "offline");
    el.connectionTitle.textContent = ready ? "Connected" : connecting ? "Connecting…" : "Disconnected";
    var sync = (self && self.sync) || state.sync || (state.hello && state.hello.sync);
    var syncNote = sync && sync.state ? ("Sync " + String(sync.state).replace(/_/g, " ") + " · " + (sync.changeSeq || 0) + " changes") : "";
    if (Array.isArray(state.changes) && state.changes.length) {
      var externalChanges = state.changes.filter(function (item) { return item && item.actor !== "agent"; }).length;
      var dirtyEntities = Object.create(null);
      state.changes.forEach(function (item) { if (item && item.entityId) dirtyEntities[item.controlId || item.entityId] = true; });
      syncNote += " · " + externalChanges + " external · " + Object.keys(dirtyEntities).length + " dirty";
    }
    el.connectionNote.textContent = ready ? ((sdkReady ? "" : "SDK update — reload plugin") + (syncNote ? (sdkReady ? "" : " · ") + syncNote : "")) : connecting ? "Finding bridge…" : "";
    var heartbeatMs = self && typeof self.lastHeartbeatMs === "number" ? self.lastHeartbeatMs : (state.lastHeartbeatAt ? Date.now() - state.lastHeartbeatAt : null);
    var uptime = ready && state.connectedAt ? Date.now() - state.connectedAt : null;
    var agentCount = ready ? sessions().length : null;
    el.lastSignal.textContent = ready ? fmtAgo(heartbeatMs) : "—";
    el.connectedFor.textContent = ready ? fmtDuration(uptime) : "—";
    el.agentPresence.textContent = ready ? String(agentCount) : "—";
    el.recovery.className = "recovery" + (phase === "disconnected" ? " show" : "");

    el.detailConnectionStatus.textContent = ready ? "Connected" : connecting ? "Connecting" : "Disconnected";
    el.detailLastSignal.textContent = ready ? fmtAgo(heartbeatMs) : "—";
    el.detailConnectedFor.textContent = ready ? fmtDuration(uptime) : "—";
    el.detailAgents.textContent = ready ? String(agentCount) : "Unavailable";
    el.detailReconnects.textContent = String(state.reconnects);
    el.detailEndpoint.textContent = state.connectedPort ? "localhost:" + state.connectedPort : "Searching 38470–38479";
    el.detailVersion.textContent = state.handshake && state.handshake.pluginVersion ? "v" + state.handshake.pluginVersion : "—";
    el.detailProtocol.textContent = state.handshake && state.handshake.protocolVersion ? String(state.handshake.protocolVersion) : "—";
    el.detailBundleRevision.textContent = ready && self && self.bundleRevision ? self.bundleRevision : "—";
    el.detailRuntimeSdk.textContent = ready ? (sdkReady ? "v2 ready" : "Reload required") : "—";
  }

  function renderRequests() {
    var self = selfSnapshot();
    var m = metrics();
    var total = m && typeof m.totalCount === "number" ? m.totalCount : 0;
    var success = m && typeof m.successCount === "number" ? m.successCount : 0;
    var failed = m && typeof m.failureCount === "number" ? m.failureCount : 0;
    var timeouts = m && typeof m.timeoutCount === "number" ? m.timeoutCount : 0;
    var completed = success + failed + timeouts;
    var running = self && typeof self.inFlight === "number" ? self.inFlight : 0;
    var waiting = self && typeof self.queueLength === "number" ? self.queueLength : 0;
    el.requestTotal.textContent = String(total);
    var active = running > 0 || waiting > 0;
    el.currentLoad.classList.toggle("active", active);
    el.currentLoad.textContent = running ? (running + " running") : (waiting ? "Queued" : "Idle");
    el.currentLoadNote.textContent = active ? (running + " running · " + waiting + " queued") : "0 queued";
    if (completed > 0) {
      el.reliabilityValue.textContent = (success / completed * 100).toFixed(1) + "%";
      el.reliabilityNote.textContent = success + " ok · " + failed + " fail · " + timeouts + " timeout";
    } else {
      el.reliabilityValue.textContent = "—";
      el.reliabilityNote.textContent = "No data";
    }
    if (m && typeof m.lastTotalMs === "number") {
      el.speedValue.textContent = fmtMs(m.lastTotalMs);
      el.speedNote.textContent = typeof m.p95TotalMs === "number" ? "p95 " + fmtMs(m.p95TotalMs) : "Collecting";
    } else {
      el.speedValue.textContent = "—";
      el.speedNote.textContent = "Waiting";
    }

    var counts = m && m.requestKinds ? m.requestKinds : { read: 0, write: 0, export: 0, other: 0 };
    var kindTotal = Math.max(0, counts.read + counts.write + counts.export + counts.other);
    var readPct = kindTotal ? Math.round(counts.read / kindTotal * 100) : 0;
    var writePct = kindTotal ? Math.round(counts.write / kindTotal * 100) : 0;
    var exportPct = kindTotal ? Math.round(counts.export / kindTotal * 100) : 0;
    var otherPct = Math.max(0, 100 - readPct - writePct - exportPct);
    el.mixRead.style.width = readPct + "%";
    el.mixWrite.style.width = writePct + "%";
    el.mixExport.style.width = exportPct + "%";
    el.mixOther.style.width = otherPct + "%";
    el.mixLabels.innerHTML = "";
    [["read", readPct, "mix-read"], ["write", writePct, "mix-write"], ["export", exportPct, "mix-export"], ["other", otherPct, "mix-other"]].forEach(function (entry) {
      if (!entry[1] && kindTotal) return;
      var span = document.createElement("span");
      span.className = "mix-label";
      span.innerHTML = '<i class="' + entry[2] + '"></i><b>' + entry[0].charAt(0).toUpperCase() + entry[0].slice(1) + " " + entry[1] + "%</b>";
      el.mixLabels.appendChild(span);
    });
    if (!kindTotal) {
      el.mixLabels.innerHTML = '<span class="mix-label"><b>No mix yet</b></span>';
      el.mixOther.style.width = "100%";
    }
    el.detailRetention.textContent = (state.telemetry && state.telemetry.historyLimit ? state.telemetry.historyLimit : 100) + " recent";
    el.detailTraffic.textContent = m ? (fmtBytes(m.requestBytes) + " ↑ · " + fmtBytes(m.responseBytes) + " ↓") : "—";
  }

  function filteredOperations() {
    return state.displayedOperations.filter(function (item) {
      if (state.filter === "all") return true;
      if (state.filter === "failed") return isProblem(item);
      return item.kind === state.filter;
    });
  }

  function requestDuration(item) {
    if (typeof item.totalMs === "number") return item.totalMs;
    return Math.max(0, Date.now() - item.enqueuedAt);
  }

  function operationDuration(item) {
    if (typeof item.totalMs === "number") return item.totalMs;
    return Math.max(0, Date.now() - item.startedAt);
  }

  function operationContext(item) {
    var parts = [sourceLabel(item)];
    if (item.stepId) parts.push(item.stepId);
    if (item.representation) parts.push(item.representation);
    if (item.phase) parts.push(item.phase);
    if (item.attemptCount > 1) parts.push(item.attemptCount + " attempts");
    else if (item.requestCount > 1) parts.push(item.requestCount + " calls");
    return parts.join(" · ");
  }

  function scheduleLogRender() {
    if (state.logRenderTimer) return;
    state.logRenderTimer = setTimeout(function () {
      state.logRenderTimer = null;
      renderLog();
    }, LOG_RENDER_DEBOUNCE_MS);
  }

  function renderLog() {
    var filtered = filteredOperations();
    var items = filtered.slice(0, state.logRenderLimit);
    el.requestList.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "empty-log";
      empty.textContent = state.displayedOperations.length ? "No matches." : state.phase === "disconnected" ? "Waiting for bridge activity." : "No operations yet.";
      el.requestList.appendChild(empty);
    } else {
      items.forEach(function (item) {
        var row = document.createElement("button");
        row.type = "button";
        row.className = "request-row";
        row.setAttribute("aria-label", kindLabel(item.kind) + " operation " + (item.label || "Unlabeled figma_exec") + ", " + statusLabel(item.status) + ", " + operationContext(item) + ", " + fmtMs(operationDuration(item)));
        row.innerHTML = '<span class="request-inner">' +
          '<span class="request-time">' + fmtClock(item.startedAt) + '</span>' +
          '<span class="kind-icon ' + item.kind + '"><svg><use href="' + kindIcon(item.kind) + '"></use></svg></span>' +
          '<span class="request-main"><span class="request-meta-line"><span class="request-kind ' + item.kind + '">' + kindLabel(item.kind) + '</span><span class="request-status ' + item.status + '">' + statusGlyph(item.status) + '</span><span class="request-source">' + escapeHtml(operationContext(item)) + '</span></span><span class="request-label">' + escapeHtml(item.label || "Unlabeled figma_exec") + '</span></span>' +
          '<span class="request-duration">' + fmtMs(operationDuration(item)) + '</span>' +
          '</span>';
        row.onclick = function () { openOperation(item); };
        el.requestList.appendChild(row);
      });
      if (filtered.length > items.length) {
        var older = document.createElement("button");
        older.type = "button";
        older.className = "load-older";
        older.textContent = "Show " + Math.min(LOG_RENDER_BATCH, filtered.length - items.length) + " older operations";
        older.onclick = function () {
          state.logRenderLimit += LOG_RENDER_BATCH;
          renderLog();
        };
        el.requestList.appendChild(older);
      }
    }
    el.logCount.textContent = (items.length < filtered.length ? items.length + "/" : "") + filtered.length + " operations · " + state.displayedRequests.length + " requests";
    el.logState.textContent = state.paused ? "Paused" : state.phase === "disconnected" ? "Offline" : (state.filter === "all" ? "" : "Filtered");
    el.newButton.hidden = state.pendingNew <= 0;
    if (state.pendingNew > 0) el.newButton.textContent = state.pendingNew + (state.pendingNew === 1 ? " update ↑" : " updates ↑");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]; });
  }

  function openOperation(item) {
    var status = statusLabel(item.status).replace(/^.[ ]?/, "");
    var requestIds = Object.create(null);
    (item.requestIds || []).forEach(function (id) { requestIds[id] = true; });
    var attempts = state.displayedRequests.filter(function (request) { return requestIds[request.id]; }).sort(function (a, b) {
      return (a.attempt || 1) - (b.attempt || 1) || a.enqueuedAt - b.enqueuedAt;
    });
    var body = '<div class="detail-hero"><span class="kind-icon ' + item.kind + '"><svg><use href="' + kindIcon(item.kind) + '"></use></svg></span><span class="detail-copy"><strong>' + kindLabel(item.kind) + " · " + status + '</strong><span>' + fmtClock(item.startedAt) + " · " + escapeHtml(item.label || "Unlabeled figma_exec") + '</span></span></div>' +
      '<div class="detail-grid">' +
      detailCell("Capability", escapeHtml(sourceLabel(item))) +
      detailCell("Trace", escapeHtml(shortTrace(item.id))) +
      detailCell("Plan", escapeHtml(shortTrace(item.planId))) +
      detailCell("Step", escapeHtml(item.stepId || "—")) +
      detailCell("Representation", escapeHtml(item.representation || "—")) +
      detailCell("Phase", escapeHtml(item.phase || "—")) +
      detailCell("Target", escapeHtml(item.target || "—")) +
      detailCell("Attempts", String(item.attemptCount || 1)) +
      detailCell("Calls", String(item.requestCount || attempts.length || 1)) +
      detailCell("Started", fmtClock(item.startedAt)) +
      detailCell("Total", fmtMs(operationDuration(item))) +
      detailCell("Result", status) +
      '</div>' +
      renderPostconditions(item.postconditions) +
      renderAttempts(attempts) +
      (item.errorCode ? '<div class="error-note">' + escapeHtml(item.errorCode) + '</div>' : "");
    el.requestDetailBody.innerHTML = body;
    el.requestSheet.showModal();
  }
  function detailCell(label, value) { return '<div class="detail-cell"><span>' + label + '</span><strong>' + value + '</strong></div>'; }

  function renderPostconditions(postconditions) {
    if (!Array.isArray(postconditions) || !postconditions.length) return "";
    return '<div class="detail-section"><div class="detail-section-title"><strong>Expected postconditions</strong><span>Not automatically verified</span></div><ul class="postcondition-list">' + postconditions.map(function (value) {
      return '<li>' + escapeHtml(value) + '</li>';
    }).join("") + '</ul></div>';
  }

  function renderAttempts(attempts) {
    if (!attempts.length) return "";
    return '<div class="detail-section"><div class="detail-section-title"><strong>Request attempts</strong><span>Low-level runtime evidence</span></div><div class="attempt-list">' + attempts.map(function (request) {
      var attempt = request.attempt || 1;
      var result = statusLabel(request.status).replace(/^.[ ]?/, "");
      return '<div class="attempt-row"><span class="attempt-index">#' + attempt + '</span><span class="attempt-copy"><strong>' + escapeHtml(result) + '</strong><span>' + fmtMs(request.queueMs) + ' queue · ' + fmtMs(request.executionMs) + ' run · ' + escapeHtml(shortTrace(request.id)) + '</span></span><span class="attempt-bytes">' + fmtBytes(request.responseBytes) + '</span></div>';
    }).join("") + '</div></div>';
  }

  function refreshTelemetryView() {
    var nextRequests = requestLog();
    var nextOperations = operationLog();
    var readingOlder = el.logScroll.scrollTop > 24;
    if (!state.paused && !readingOlder) {
      state.displayedOperations = nextOperations.slice();
      state.displayedRequests = nextRequests.slice();
      state.pendingNew = 0;
    } else {
      var visibleVersions = Object.create(null);
      state.displayedOperations.forEach(function (item) { visibleVersions[item.id] = operationVersion(item); });
      state.pendingNew = nextOperations.reduce(function (count, item) { return count + (visibleVersions[item.id] === operationVersion(item) ? 0 : 1); }, 0);
      if (!state.displayedOperations.length && !nextOperations.length) state.pendingNew = 0;
    }
    renderRequests();
    scheduleLogRender();
  }

  function scheduleTelemetryView() {
    if (state.telemetryRenderTimer) return;
    state.telemetryRenderTimer = setTimeout(function () {
      state.telemetryRenderTimer = null;
      refreshTelemetryView();
    }, TELEMETRY_RENDER_DEBOUNCE_MS);
  }

  function applyTelemetry(update, seq) {
    if (state.telemetryRenderTimer) clearTimeout(state.telemetryRenderTimer);
    state.telemetryRenderTimer = null;
    state.telemetry = update || null;
    state.telemetrySeq = typeof seq === "number" ? seq : null;
    state.telemetryResyncPending = false;
    refreshTelemetryView();
  }

  function removeTelemetryItems(items, ids) {
    if (!Array.isArray(ids) || !ids.length) return items;
    var remove = Object.create(null);
    ids.forEach(function (id) { remove[id] = true; });
    return items.filter(function (item) { return !remove[item.id]; });
  }

  function upsertTelemetryItems(items, updates) {
    if (!Array.isArray(updates) || !updates.length) return items;
    // Delta arrays use newest-first order, so insert older records first.
    for (var i = updates.length - 1; i >= 0; i--) {
      var update = updates[i];
      var index = items.findIndex(function (item) { return item.id === update.id; });
      if (index >= 0) items[index] = update;
      else items.unshift(update);
    }
    return items;
  }

  function applyTelemetryDelta(delta) {
    if (!delta || typeof delta.seq !== "number" || !state.telemetry || typeof state.telemetrySeq !== "number" || delta.seq !== state.telemetrySeq + 1) {
      requestTelemetryResync();
      return;
    }
    var current = state.telemetry;
    if (delta.clearHistory) {
      current.requests = [];
      current.operations = [];
    }
    current.requests = removeTelemetryItems(Array.isArray(current.requests) ? current.requests : [], delta.requestIdsRemoved);
    current.operations = removeTelemetryItems(Array.isArray(current.operations) ? current.operations : [], delta.operationIdsRemoved);
    current.requests = upsertTelemetryItems(current.requests, delta.requests);
    current.operations = upsertTelemetryItems(current.operations, delta.operations);
    if (delta.metrics) current.metrics = delta.metrics;
    if (typeof delta.historyLimit === "number") current.historyLimit = delta.historyLimit;
    var self = selfSnapshot();
    if (self && delta.runtime) {
      self.queueLength = delta.runtime.queueLength;
      self.pendingCount = delta.runtime.pendingCount;
      self.inFlight = delta.runtime.inFlight;
    }
    state.telemetrySeq = delta.seq;
    state.telemetryResyncPending = false;
    scheduleTelemetryView();
  }

  function operationVersion(item) {
    return [item.requestCount || 0, item.attemptCount || 0, item.status || "", item.finishedAt || 0].join(":");
  }

  function flushNew() {
    state.displayedOperations = operationLog().slice();
    state.displayedRequests = requestLog().slice();
    state.pendingNew = 0;
    state.logRenderLimit = LOG_RENDER_BATCH;
    renderLog();
    el.logScroll.scrollTop = 0;
  }

  window.onmessage = function (event) {
    var message = event.data && event.data.pluginMessage;
    if (!message || typeof message !== "object") return;
    if (message.kind === "handshake") {
      state.handshake = message;
      renderConnection();
      return;
    }
    if (message.kind === "hello") {
      state.hello = message.hello;
      state.sync = message.hello && message.hello.sync ? message.hello.sync : state.sync;
      renderContext();
      if (state.ws && state.ws.readyState === 1) sendHello();
      return;
    }
    if (message.kind === "change-feed") {
      applyChangeFeed(message);
      return;
    }
    if (message.kind === "response") {
      if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ type: "response", payload: message.payload }));
      return;
    }
    if (message.kind === "binary-response") {
      sendBinary(message);
    }
  };

  el.connectionButton.onclick = function () { el.connectionSheet.showModal(); };
  el.systemButton.onclick = function () { el.systemSheet.showModal(); };
  el.retryButton.onclick = reconnectNow;
  el.pauseButton.onclick = function () {
    state.paused = !state.paused;
    el.pauseButton.classList.toggle("active", state.paused);
    el.pauseButton.setAttribute("aria-pressed", String(state.paused));
    el.pauseButton.setAttribute("aria-label", state.paused ? "Resume live log" : "Pause live log");
    el.pauseButton.title = state.paused ? "Resume live log" : "Pause live log";
    el.pauseIcon.setAttribute("href", state.paused ? "#i-play" : "#i-pause");
    if (!state.paused) flushNew(); else renderLog();
  };
  el.filterButton.onclick = function () {
    el.filterTray.hidden = !el.filterTray.hidden;
    el.filterButton.classList.toggle("active", !el.filterTray.hidden);
    el.filterButton.setAttribute("aria-expanded", String(!el.filterTray.hidden));
  };
  document.querySelectorAll("[data-filter]").forEach(function (button) {
    button.onclick = function () {
      state.filter = button.getAttribute("data-filter") || "all";
      state.logRenderLimit = LOG_RENDER_BATCH;
      document.querySelectorAll("[data-filter]").forEach(function (other) { other.setAttribute("aria-pressed", String(other === button)); });
      renderLog();
    };
  });
  el.clearButton.onclick = function () { el.clearSheet.showModal(); };
  el.confirmClear.onclick = function () {
    state.displayedOperations = [];
    state.displayedRequests = [];
    state.pendingNew = 0;
    state.logRenderLimit = LOG_RENDER_BATCH;
    if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ type: "clear_request_log" }));
    renderLog();
    el.clearSheet.close();
  };
  el.newButton.onclick = flushNew;
  el.logScroll.addEventListener("scroll", function () {
    if (!state.paused && el.logScroll.scrollTop <= 24 && state.pendingNew > 0) flushNew();
  });
  document.querySelectorAll("[data-close]").forEach(function (button) {
    button.onclick = function () {
      var dialog = document.getElementById(button.getAttribute("data-close"));
      if (dialog && dialog.open) dialog.close();
    };
  });
  document.querySelectorAll("dialog").forEach(function (dialog) {
    dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
  });

  setInterval(function () {
    renderConnection();
    if (!state.paused && state.displayedOperations.some(function (item) { return item.status === "running" || item.status === "queued"; })) scheduleLogRender();
  }, 1000);
  toMain({ kind: "handshake" });
  toMain({ kind: "resize", height: 720 });
  renderContext();
  renderConnection();
  renderRequests();
  renderLog();
  connect();
})();

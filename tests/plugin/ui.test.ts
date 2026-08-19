import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Figma Plugin companion UI", () => {
  const html = readFileSync(new URL("../../plugin/ui.html", import.meta.url), "utf8");
  const main = readFileSync(new URL("../../src/plugin/main.ts", import.meta.url), "utf8");

  it("uses one live companion surface with connection, request summary, and a bottom operation log", () => {
    expect(html).toMatch(/<meta charset=["']utf-8["']>/i);
    expect(html).toContain('class="section-label">Connection');
    expect(html).toContain('class="section-label">Requests');
    expect(html).toContain('class="section-label">Operation log');
    expect(html.indexOf('>Connection<')).toBeLessThan(html.indexOf('>Requests<'));
    expect(html.indexOf('>Requests<')).toBeLessThan(html.indexOf('>Operation log<'));
    expect(html).not.toContain('data-view="home"');
    expect(html).not.toContain('class="bottom-nav"');
  });

  it("keeps primary connection language human-readable and technical transport details secondary", () => {
    expect(html).toContain("Finding bridge");
    expect(html).toContain(">Signal<");
    expect(html).toContain(">Uptime<");
    expect(html).toContain(">Agents<");
    expect(html).toContain(">System<");
    expect(html).toContain("WebSocket");
  });

  it("summarizes request volume, reliability, speed, load, and semantic request kinds", () => {
    expect(html).toContain("requestTotal");
    expect(html).not.toContain("requests since this connection started");
    expect(html).toContain("Success");
    expect(html).toContain("Latency");
    expect(html).toContain("running");
    expect(html).toContain("queued");
    expect(html).toContain("Read");
    expect(html).toContain("Write");
    expect(html).toContain("Export");
    expect(html).toContain("Other");
  });

  it("groups retries in a bounded operation log while retaining request-level evidence", () => {
    expect(html).toContain('class="log-scroll"');
    expect(html).toContain("overflow-y: auto");
    expect(html).toContain('id="pauseButton"');
    expect(html).toContain('id="filterButton"');
    expect(html).toContain('id="clearButton"');
    expect(html).toContain('type: "clear_request_log"');
    expect(html).toContain("0 operations · 0 requests");
    expect(html).toContain("Operation");
    expect(html).toContain("Expected postconditions");
    expect(html).toContain("Not automatically verified");
    expect(html).toContain("Request attempts");
    expect(html).toContain('detailCell("Plan"');
    expect(html).toContain('detailCell("Representation"');
    expect(html).toContain("displayedOperations");
    expect(html).toContain("operationVersion");
    expect(html).toContain("!state.paused && state.displayedOperations.some");
    expect(html).toContain("statusGlyph");
    expect(html).toContain("Unlabeled figma_exec");
    expect(html).toContain("request-source");
    expect(html).toContain("Waiting for bridge activity.");
    expect(html).toContain("LOG_RENDER_BATCH = 24");
    expect(html).toContain("LOG_RENDER_DEBOUNCE_MS = 80");
    expect(html).toContain("scheduleLogRender");
    expect(html).toContain("older operations");
    expect(html).toContain('data.type === "telemetry_delta"');
    expect(html).toContain('type: "telemetry_resync"');
    expect(html).toContain("applyTelemetryDelta");
    expect(html).toContain("telemetrySeq");
    expect(html).toContain("scheduleTelemetryView");
    expect(html).toContain("delta.runtime");
    expect(html).toContain("data.telemetrySeq !== state.telemetrySeq");
    expect(html).not.toContain("else { renderRequests(); renderLog(); }");
  });

  it("uses a tall desktop utility viewport rather than the rejected short mobile-like panel", () => {
    expect(main).toContain("UI_WIDTH = 390");
    expect(main).toContain("UI_INITIAL_HEIGHT = 720");
    expect(main).toContain("UI_MIN_HEIGHT = 620");
    expect(main).toContain("UI_MAX_HEIGHT = 820");
    expect(main).toContain("figma.ui.resize(UI_WIDTH, height)");
    expect(html).toContain('kind: "resize", height: 720');
  });

  it("preserves binary websocket framing for raster responses", () => {
    expect(html).toContain('message.kind === "binary-response"');
    expect(html).toContain("new DataView(frame.buffer).setUint32");
    expect(html).toContain("state.ws.send(frame.buffer)");
  });

  it("forwards exact loaded Runtime SDK capabilities in the plugin hello", () => {
    expect(html).toContain("runtimeSdks: Array.isArray(state.hello.runtimeSdks)");
    expect(html).toContain('id="detailRuntimeSdk"');
    expect(html).toContain('id="detailBundleRevision"');
    expect(html).toContain("SDK update — reload plugin");
    expect(html).toContain("Reload required");
    expect(html).toContain('runtimeSdks.indexOf("v2")');
    expect(html).toContain("v2 ready");
  });
});

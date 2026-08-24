import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { RuntimeClient, assert, readOption } from "./lib/runtime-client.mjs";

const WAIT_TIMEOUT_MS = positiveIntegerOption("--wait-timeout-ms", 180_000);
const STATUS_POLL_MS = 1_000;
const EXPECTED_PROTOCOL_VERSION = 10;
const EXPECTED_SERVER_PREFIX = "0.7.";
const EXPECTED_FILE_NAME = "Untitled";
const EXPECTED_FILE_KEY = null;
const EXPECTED_PAGE_NAMES = Object.freeze({
  system: "01 — Luma Bank / System & Components",
  screens: "02 — Luma Bank / Mobile Screens",
  flow: "03 — Luma Bank / Flow & States",
});
const EXPECTED_PAGE_IDS = Object.freeze({ system: "96:405", screens: "96:406", flow: "96:407" });
const EXPECTED_PROTOTYPE = Object.freeze({
  startingPointCount: 3,
  edgeCount: 40,
  reachableNodeCount: 16,
  unreachableSourceIds: ["109:3155", "109:3181"],
  unreachableOwnerIds: ["109:3137", "109:3163"],
});
const EXPECTED_MOTION_ROOT_ID = "109:3404";
const EXPECTED_MOTION_NODE_COUNT = 8;
const ACCESSIBILITY_PAGE_LIMIT = 100;
const MOTION_PAGE_LIMIT = 2;
const MAX_RESULT_PAGES = 20;

const runtimePort = process.env.CONTROLMUX_FIGMA_PORT;
const runtime = new RuntimeClient({
  name: "luma-query-fixes-live-verifier",
  ...(runtimePort ? { env: { CONTROLMUX_FIGMA_PORT: runtimePort } } : {}),
});
const traceRoot = `luma-query-fixes:${Date.now()}`;
const explicitBundleRevision = optionValue("--bundle-revision") ?? readOption("--bundle-revision");

let pinned;
try {
  await runtime.connect();
  const serverStatus = await runtime.status(true);
  const expectedBundleRevision = explicitBundleRevision ?? serverStatus.bundleRevision;
  assert(typeof expectedBundleRevision === "string" && expectedBundleRevision.length > 0, "Could not derive the expected bundle revision from --bundle-revision or figma_status.");
  assert(serverStatus.bundleRevision === expectedBundleRevision, `The local server bundle is ${serverStatus.bundleRevision}; expected ${expectedBundleRevision}. Rebuild before running this verifier.`);

  const status = await waitForCompatibleCompanion(expectedBundleRevision);
  const instance = status.instances[0];
  pinned = {
    instanceId: instance.instanceId,
    fileName: instance.fileName,
    fileKey: instance.fileKey ?? null,
    initialPageId: instance.pageId,
    bundleRevision: expectedBundleRevision,
    serverVersion: status.serverVersion,
  };
  assert(pinned.fileName === EXPECTED_FILE_NAME && pinned.fileKey === EXPECTED_FILE_KEY, `Expected the exact current Luma artifact ${EXPECTED_FILE_NAME} with no file key; got ${pinned.fileName} (${pinned.fileKey ?? "no file key"}).`);

  const inventory = await query("file_inventory", pinned.initialPageId, { refresh: true }, "inventory");
  const pageIds = resolveExactPages(inventory);

  const prototype = await query("prototype_graph", pageIds.screens, { scope: "document", refresh: true }, "prototype-owner-reachability");
  verifyPrototype(prototype);

  const motion = await collectPages({
    kind: "motion_snapshot",
    pageId: pageIds.flow,
    params: { scope: "node", nodeId: EXPECTED_MOTION_ROOT_ID, refresh: true, limit: MOTION_PAGE_LIMIT },
    stepId: "motion-subtree",
    extract: (result) => result?.facts?.nodes,
  });
  verifyMotion(motion);
  const genericRoot = await query("entity_graph", pageIds.flow, { scope: "node", nodeId: EXPECTED_MOTION_ROOT_ID, refresh: true, limit: 10 }, "generic-node-scope-control");
  assert(genericRoot?.coverage?.total === 1 && genericRoot?.coverage?.returned === 1 && genericRoot?.facts?.items?.[0]?.id === EXPECTED_MOTION_ROOT_ID, "Generic entity_graph scope=node no longer preserves exact-root semantics.");

  const accessibility = await collectPages({
    kind: "accessibility_design_facts",
    pageId: pageIds.screens,
    params: { scope: "page", refresh: true, limit: ACCESSIBILITY_PAGE_LIMIT },
    stepId: "accessibility-screens-page",
    extract: (result) => result?.facts?.interactive,
    verifyPage: (result, items) => {
      assert(result?.facts?.interactiveCoverage?.alignedTo === "graph_page", "Accessibility facts are not aligned to the delivered graph page.");
      assert(result.facts.interactiveCoverage.returned === items.length, "Accessibility interactiveCoverage.returned does not match the delivered facts.");
      assert(result?.facts?.runtimeSemantics === "NOT_RUN", "Design-fact verification must not manufacture runtime accessibility evidence.");
    },
  });
  verifyAccessibility(accessibility, prototype);

  const flowAccessibility = await query("accessibility_design_facts", pageIds.flow, { scope: "page", refresh: true, limit: 1 }, "accessibility-flow-scope-control");
  assert(flowAccessibility?.coverage?.scope === "page", "Flow accessibility control query did not remain page-scoped.");
  assert(flowAccessibility.coverage.total !== accessibility.total, "Distinct exact page IDs unexpectedly returned the same graph total; page routing may have been dropped.");

  const finalStatus = await runtime.status(true);
  assertPinnedRuntime(finalStatus);

  const min44Failures = accessibility.items.filter((item) => item?.hitTargetMin44 !== true).map((item) => item.id);
  const summary = {
    status: "LUMA_QUERY_FIXES_LIVE_VERIFIED",
    readOnly: true,
    mutationToolsUsed: [],
    target: { ...pinned, pageIds },
    prototype: {
      startingPointCount: prototype.facts.startingPoints.length,
      edgeCount: prototype.facts.edgeCount,
      reachableNodeCount: prototype.facts.reachableNodeIds.length,
      unreachableSourceIds: prototype.facts.unreachableSourceIds,
      unreachableOwnerIds: prototype.facts.unreachableOwnerIds,
    },
    motion: {
      rootId: EXPECTED_MOTION_ROOT_ID,
      total: motion.total,
      pages: motion.pages.length,
      animatedNodeIds: motion.items.filter((item) => hasManualTracks(item?.manualKeyframeTracks)).map((item) => item.id),
    },
    accessibility: {
      pageId: pageIds.screens,
      graphTotal: accessibility.total,
      graphPages: accessibility.pages.length,
      interactiveCount: accessibility.items.length,
      min44FailureIds: min44Failures,
      runtimeSemantics: "NOT_RUN",
    },
    limitations: [
      "Typed graph facts do not prove Presentation playback.",
      "Accessibility runtime semantics and assistive-technology behavior remain NOT_RUN.",
      "Motion keyframe readback does not prove temporal playback or rendered video quality.",
    ],
  };
  const evidencePath = resolve("output", "figma-evidence", `luma-query-fixes-live-${Date.now()}.json`);
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...summary, evidencePath }, null, 2)}\n`);
} finally {
  await runtime.close();
}

async function waitForCompatibleCompanion(expectedBundleRevision) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let lastStatus = null;
  while (Date.now() <= deadline) {
    try {
      const status = await runtime.status(true);
      lastStatus = status;
      const instances = Array.isArray(status.instances) ? status.instances : [];
      const instance = instances[0];
      const compatible = status.pluginConnected === true
        && status.serverVersion?.startsWith(EXPECTED_SERVER_PREFIX)
        && status.protocolVersion === EXPECTED_PROTOCOL_VERSION
        && status.bundleRevision === expectedBundleRevision
        && instances.length === 1
        && instance?.bundleRevision === expectedBundleRevision
        && Array.isArray(instance.runtimeSdks)
        && instance.runtimeSdks.includes("v2");
      if (compatible) return status;
    } catch (error) {
      lastStatus = { error: error instanceof Error ? error.message : String(error) };
    }
    await delay(STATUS_POLL_MS);
  }
  throw new Error(`No single Runtime SDK v2 companion for bundle ${expectedBundleRevision} became available within ${WAIT_TIMEOUT_MS}ms. Last status: ${JSON.stringify(lastStatus)}`);
}

async function query(kind, pageId, params, stepId) {
  const payload = await runtime.call("figma_query", {
    kind,
    ...params,
    instanceId: pinned.instanceId,
    pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:${stepId}`,
    operation: {
      label: `Verify Luma typed query fix: ${kind}`,
      kind: "read",
      phase: "verify",
      planId: "luma-query-fixes-live",
      stepId,
      target: `${pinned.fileName} / ${pageId}`,
      representation: kind === "prototype_graph" ? "state-diagram" : kind === "motion_snapshot" ? "timeline" : kind === "entity_graph" ? "tree" : "table",
      postconditions: ["Only typed facts are read from the exact pinned Figma artifact and bundle"],
    },
  });
  return unwrapToolPayload(payload);
}

async function collectPages({ kind, pageId, params, stepId, extract, verifyPage }) {
  const pages = [];
  const items = [];
  const seenCursors = new Set();
  let cursor;
  let expectedTotal;
  let expectedScanned;
  for (let pageIndex = 0; pageIndex < MAX_RESULT_PAGES; pageIndex += 1) {
    const result = await query(kind, pageId, { ...params, ...(cursor ? { cursor, refresh: false } : {}) }, `${stepId}-${pageIndex + 1}`);
    const delivered = extract(result);
    assert(Array.isArray(delivered), `${kind} page ${pageIndex + 1} returned no fact array.`);
    const coverage = result?.coverage ?? result?.facts?.graphCoverage;
    assert(coverage && coverage.scope === params.scope, `${kind} page ${pageIndex + 1} returned invalid ${params.scope} coverage.`);
    assert(coverage.returned === (kind === "accessibility_design_facts" ? coverage.returned : delivered.length), `${kind} coverage metadata is invalid.`);
    if (expectedTotal === undefined) {
      expectedTotal = coverage.total;
      expectedScanned = coverage.scanned;
    } else {
      assert(coverage.total === expectedTotal && coverage.scanned === expectedScanned, `${kind} coverage drifted across pages.`);
    }
    if (verifyPage) verifyPage(result, delivered);
    pages.push(result);
    items.push(...delivered);
    if (coverage.truncated !== true) {
      assert(pages.reduce((sum, page) => sum + Number((page.coverage ?? page.facts?.graphCoverage)?.returned ?? 0), 0) === expectedTotal, `${kind} graph pagination did not deliver all ${expectedTotal} nodes.`);
      return { pages, items, total: expectedTotal, scanned: expectedScanned };
    }
    assert(typeof coverage.nextCursor === "string" && coverage.nextCursor.length > 0 && !seenCursors.has(coverage.nextCursor), `${kind} pagination did not advance.`);
    seenCursors.add(coverage.nextCursor);
    cursor = coverage.nextCursor;
  }
  throw new Error(`${kind} exceeded the ${MAX_RESULT_PAGES}-page verification guard.`);
}

function resolveExactPages(inventory) {
  const pages = inventory?.pages;
  assert(Array.isArray(pages) && pages.length === 3, `The exact Luma artifact must contain three pages; found ${Array.isArray(pages) ? pages.length : 0}.`);
  const resolved = {};
  for (const [role, expectedName] of Object.entries(EXPECTED_PAGE_NAMES)) {
    const matches = pages.filter((page) => page.name === expectedName);
    assert(matches.length === 1, `Expected exactly one page named ${expectedName}; found ${matches.length}.`);
    resolved[role] = matches[0].id;
    assert(matches[0].id === EXPECTED_PAGE_IDS[role], `Page ${expectedName} has ID ${matches[0].id}; expected exact artifact ID ${EXPECTED_PAGE_IDS[role]}.`);
  }
  return resolved;
}

function verifyPrototype(result) {
  const facts = result?.facts;
  assert(result?.coverage?.scope === "document" && result.coverage.truncated === false, "Prototype graph was not returned as one complete document graph.");
  assert(Array.isArray(facts?.startingPoints) && facts.startingPoints.length === EXPECTED_PROTOTYPE.startingPointCount, `Expected ${EXPECTED_PROTOTYPE.startingPointCount} prototype starting points.`);
  assert(Array.isArray(facts?.edges) && facts.edgeCount === EXPECTED_PROTOTYPE.edgeCount && facts.edges.length === EXPECTED_PROTOTYPE.edgeCount, `Expected ${EXPECTED_PROTOTYPE.edgeCount} prototype edges.`);
  assert(facts.missingDestinationCount === 0 && Array.isArray(facts.missingDestinations) && facts.missingDestinations.length === 0, "Prototype graph contains missing destinations.");
  assert(facts.edges.every((edge) => typeof edge.sourceOwnerId === "string" && edge.sourceOwnerId.length > 0), "At least one nested prototype action has no source owner identity.");
  assert(Array.isArray(facts.reachableNodeIds) && facts.reachableNodeIds.length === EXPECTED_PROTOTYPE.reachableNodeCount, `Expected ${EXPECTED_PROTOTYPE.reachableNodeCount} owner-propagated reachable nodes; got ${facts?.reachableNodeIds?.length ?? 0}.`);
  assert(sameSet(facts.unreachableSourceIds, EXPECTED_PROTOTYPE.unreachableSourceIds), `Unexpected unreachable prototype sources: ${JSON.stringify(facts.unreachableSourceIds)}.`);
  assert(sameSet(facts.unreachableOwnerIds, EXPECTED_PROTOTYPE.unreachableOwnerIds), `Unexpected unreachable prototype owners: ${JSON.stringify(facts.unreachableOwnerIds)}.`);
  for (const edge of facts.edges.filter((item) => EXPECTED_PROTOTYPE.unreachableSourceIds.includes(item.sourceId))) {
    assert(EXPECTED_PROTOTYPE.unreachableOwnerIds.includes(edge.sourceOwnerId), `Unreachable action ${edge.sourceId} was attributed to unexpected owner ${edge.sourceOwnerId}.`);
  }
}

function verifyMotion(result) {
  const ids = result.items.map((item) => item?.id);
  assert(result.total === EXPECTED_MOTION_NODE_COUNT && result.items.length === EXPECTED_MOTION_NODE_COUNT, `Expected the motion root plus ${EXPECTED_MOTION_NODE_COUNT - 1} descendants; got ${result.items.length} of ${result.total}.`);
  assert(result.pages.length > 1, "Motion subtree verifier did not exercise pagination.");
  assert(new Set(ids).size === ids.length && ids.includes(EXPECTED_MOTION_ROOT_ID), "Motion subtree pagination lost or repeated node identities.");
  const badge = result.items.find((item) => item?.name === "animated / success badge");
  const check = result.items.find((item) => item?.name === "animated / check");
  assert(badge && hasManualTracks(badge.manualKeyframeTracks), "Motion snapshot did not include the success badge manual keyframe tracks.");
  assert(check && hasManualTracks(check.manualKeyframeTracks), "Motion snapshot did not include the success check manual keyframe track.");
}

function verifyAccessibility(accessibility, prototype) {
  assert(accessibility.pages.length > 1, "Accessibility verifier did not exercise page pagination.");
  assert(accessibility.total > ACCESSIBILITY_PAGE_LIMIT && accessibility.total < 1_005, `Screens-page accessibility scope returned implausible total ${accessibility.total}; expected a strict subset of the 1005-node document.`);
  const ids = accessibility.items.map((item) => item?.id);
  assert(new Set(ids).size === ids.length, "Accessibility pagination repeated interactive facts.");
  assert(accessibility.items.every((item) => typeof item?.hitTargetMin44 === "boolean"), "Accessibility facts omitted the minimum-hit-target design fact.");
  const expectedInteractiveIds = [...new Set(prototype.facts.edges.map((edge) => edge.sourceId))];
  assert(sameSet(ids, expectedInteractiveIds), "Screens-page accessibility facts do not match the exact prototype action-source inventory.");
}

function assertPinnedRuntime(status) {
  const instance = status?.instances?.find((candidate) => candidate.instanceId === pinned.instanceId);
  assert(status?.pluginConnected === true && instance, `Pinned Figma companion ${pinned.instanceId} disconnected during verification.`);
  assert(status.bundleRevision === pinned.bundleRevision && instance.bundleRevision === pinned.bundleRevision, "Bundle identity drifted during verification.");
  assert(instance.fileName === pinned.fileName && (instance.fileKey ?? null) === pinned.fileKey, "Figma file identity drifted during verification.");
  assert(status.queueLength === 0 && status.pendingCount === 0 && instance.inFlight === 0, "Runtime was not idle after read-only verification.");
}

function unwrapToolPayload(payload) {
  if (payload && payload.status === "success" && payload.result !== undefined) return payload.result;
  if (payload && payload.status === "error" && payload.error !== undefined) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  return payload;
}

function hasManualTracks(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && typeof value === "object" && Object.keys(value).length > 0;
}

function sameSet(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((item) => right.includes(item));
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && typeof process.argv[index + 1] === "string" && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : undefined;
}

function positiveIntegerOption(name, fallback) {
  const raw = optionValue(name) ?? readOption(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  assert(Number.isInteger(value) && value > 0, `${name} must be a positive integer.`);
  return value;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

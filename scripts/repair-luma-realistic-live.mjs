import { createHash, randomUUID } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeClient, assert, textPayload } from "./lib/runtime-client.mjs";

const WAIT_TIMEOUT_MS = 5 * 60_000;
const STATUS_POLL_MS = 1_000;
const NORMAL_TIMEOUT_MS = 150_000;
const EXEC_TIMEOUT_MS = 330_000;
const EXPORT_TIMEOUT_MS = 330_000;
const EXPECTED_SERVER_PREFIX = "0.7.";
const EXPECTED_PROTOCOL_VERSION = 10;
const EXPECTED_BUNDLE_REVISION = "75d1ef41a8182e2f";
const REGISTRY_NAMESPACE = "luma.realistic.authoring";
const EXPECTED_PAGE_NAMES = Object.freeze({
  system: "01 — Luma Bank / System & Components",
  screens: "02 — Luma Bank / Mobile Screens",
  flow: "03 — Luma Bank / Flow & States",
});

export async function main() {
  const registryKey = requiredOption("--registry-key");
  const startedAt = new Date().toISOString();
  const runId = `${compactTimestamp(startedAt)}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const traceRoot = `luma-realistic-repair:${runId}`;
  const planId = `luma-realistic-repair:${runId}`;
  const evidenceDir = resolve("output/figma-evidence");
  const journalPath = resolve(evidenceDir, `luma-realistic-repair-${runId}.jsonl`);
  const summaryPath = resolve(evidenceDir, `luma-realistic-repair-${runId}.summary.json`);
  const runtime = new RuntimeClient({ name: "luma-realistic-repair-live" });
  const journal = createJournal(journalPath, runId);
  const summary = {
    schemaVersion: 1,
    kind: "LumaRealisticRepairRun",
    runId,
    startedAt,
    finishedAt: null,
    workflowState: "STARTING",
    boundedVerdict: "NOT_RUN",
    registry: { namespace: REGISTRY_NAMESPACE, key: registryKey },
    target: null,
    pageIds: null,
    repair: null,
    typedReadback: [],
    componentIntegrity: null,
    coreProbes: {
      pagination: null,
      exportIntegrity: null,
    },
    exports: [],
    finalRuntime: null,
    failure: null,
    limitations: [
      "PNG capture and typed readback do not by themselves prove visual acceptance.",
      "Presentation playback, accessibility runtime behavior, publication, UAT, and release remain NOT_RUN.",
      "The repair is intentionally bound to one registry key, three exact page names, and one exact 0.7 bundle revision.",
    ],
    evidence: { journalPath, summaryPath },
  };

  let connected = false;
  let pinned = null;
  await mkdir(evidenceDir, { recursive: true });
  await journal.write("session-start", "OBSERVED", { startedAt, traceRoot, planId, registry: summary.registry });

  try {
    await runtime.connect();
    connected = true;
    const status = await waitForPinnedCompanion(runtime, journal, WAIT_TIMEOUT_MS);
    const instance = status.instances[0];
    pinned = {
      instanceId: instance.instanceId,
      initialPageId: instance.pageId,
      fileKey: instance.fileKey ?? null,
      fileName: instance.fileName,
      editorType: instance.editorType,
      serverVersion: status.serverVersion,
      protocolVersion: status.protocolVersion,
      bundleRevision: status.bundleRevision,
    };
    summary.target = pinned;
    summary.workflowState = "TARGET_PINNED";
    await journal.write("target-pinned", "OBSERVED", pinned);

    const inventory = await query(runtime, journal, pinned, traceRoot, planId, "pre-inventory", "file_inventory");
    const pageIds = resolveExactLumaPages(inventory);
    assert(Object.values(pageIds).includes(pinned.initialPageId), "The pinned current page is not one of the exact Luma pages.");
    summary.pageIds = pageIds;
    await journal.write("exact-pages-pinned", "OBSERVED", { pageIds, expectedNames: EXPECTED_PAGE_NAMES });
    await assertPinnedRuntime(runtime, journal, pinned, "before-repair");

    const repairResult = await mutationStep(runtime, journal, "repair-execute", "figma_exec", {
      code: buildRepairCode({ registryKey, pageIds }),
      runtimeSdk: "v2",
      maxOutputChars: 100_000,
      instanceId: pinned.instanceId,
      pageId: pageIds.screens,
      capability: "figma-design-authoring",
      traceId: `${traceRoot}:repair-execute`,
      attempt: 1,
      operation: operation(planId, "repair-execute", "Repair Luma status semantics, outcome icons, login-error spacing, and overlay density", "write", "execute", `${pinned.fileName} / exact Luma registry ${REGISTRY_NAMESPACE}:${registryKey}`, "rendered-composition", [
        "Feedback/Status Chip has no shared Label property and every Tone owns its fixed semantic label",
        "Pending and failure screens consume the matching status variants and non-success outcome glyphs",
        "Login-error recovery controls occupy the specified non-overlapping y positions",
        "Share, lock, goal, and detail overlays plus sibling scrims have the specified compact heights",
        "The current registry is updated and one undo checkpoint is committed",
      ]),
    }, EXEC_TIMEOUT_MS, async (failure) => {
      await reconcileAmbiguousMutation(runtime, journal, pinned, traceRoot, planId, failure);
    });
    validateRepairResult(repairResult, pageIds, registryKey);
    summary.repair = sanitizeResult(repairResult);
    summary.workflowState = "REPAIR_COMMITTED";

    const targets = repairTargets(repairResult, pageIds);
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const result = await query(runtime, journal, pinned, traceRoot, planId, `readback-${index + 1}-${target.key}`, "structure", {
        nodeId: target.nodeId,
        includeChildren: true,
        routePageId: target.pageId,
      });
      summary.typedReadback.push({ key: target.key, nodeId: target.nodeId, pageId: target.pageId, result: sanitizeResult(result) });
    }

    const integrity = await collectCompleteComponentIntegrity(runtime, journal, pinned, traceRoot, planId);
    summary.componentIntegrity = sanitizeResult(integrity);

    summary.coreProbes.pagination = await probeTypedPagination({
      runtime,
      journal,
      pinned,
      traceRoot,
      planId,
    });

    summary.coreProbes.exportIntegrity = await probeExportIntegrity({
      runtime,
      journal,
      pinned,
      traceRoot,
      planId,
      evidenceDir,
      runId,
      nodeId: repairResult.motion.success.id,
      pageId: pageIds.flow,
    });

    for (let index = 0; index < targets.length; index += 1) {
      summary.exports.push(await exportEvidence({
        runtime,
        journal,
        pinned,
        traceRoot,
        planId,
        evidenceDir,
        runId,
        target: targets[index],
        index,
      }));
    }
    assert(summary.exports.length === 8, `Expected eight repaired exports; captured ${summary.exports.length}.`);
    assert(summary.exports.every((artifact) => artifact.png.width > 1 && artifact.png.height > 1), "One or more repaired PNGs have invalid dimensions.");

    const finalInventory = await query(runtime, journal, pinned, traceRoot, planId, "final-inventory", "file_inventory");
    const finalPageIds = resolveExactLumaPages(finalInventory);
    assert(sameRecord(finalPageIds, pageIds), "Exact Luma page identity drifted after repair.");
    const finalStatus = await assertPinnedRuntime(runtime, journal, pinned, "final-runtime", true);
    const finalInstance = finalStatus.instances.find((candidate) => candidate.instanceId === pinned.instanceId);
    summary.finalRuntime = {
      pluginConnected: finalStatus.pluginConnected,
      serverVersion: finalStatus.serverVersion,
      protocolVersion: finalStatus.protocolVersion,
      bundleRevision: finalStatus.bundleRevision,
      queueLength: finalStatus.queueLength,
      pendingCount: finalStatus.pendingCount,
      instanceInFlight: finalInstance?.inFlight ?? null,
    };
    summary.workflowState = "EVIDENCE_CAPTURED";
  } catch (error) {
    summary.failure = serializeError(error);
    summary.workflowState = classifyFailure(error);
    process.exitCode = 1;
    await journal.write("session-failure", summary.workflowState, summary.failure);
  } finally {
    if (connected) {
      try {
        await runtime.close();
      } catch (error) {
        await journal.write("runtime-close", "INCONCLUSIVE", { error: serializeError(error) });
        if (!summary.failure) {
          summary.failure = serializeError(error);
          summary.workflowState = "INCONCLUSIVE";
          process.exitCode = 1;
        }
      }
    }
    summary.finishedAt = new Date().toISOString();
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await journal.write("session-summary", summary.workflowState, {
      summaryPath,
      boundedVerdict: summary.boundedVerdict,
      failure: summary.failure,
    });
    process.stdout.write(`${JSON.stringify({ runId, workflowState: summary.workflowState, boundedVerdict: summary.boundedVerdict, journalPath, summaryPath })}\n`);
  }
}

export function buildRepairCode({ registryKey, pageIds }) {
  const config = {
    namespace: REGISTRY_NAMESPACE,
    registryKey,
    pageIds,
    pageNames: EXPECTED_PAGE_NAMES,
    fixedStatusLabels: { Success: "Hoàn tất", Pending: "Đang xử lý", Error: "Thất bại", Info: "Cần OTP" },
    loginY: { forgot: 480, submit: 524, face: 594, trusted: 664 },
    overlaySpecs: {
      share: { height: 330 },
      lock: { height: 280, actionsY: 170 },
      goal: { height: 350, actionsY: 240 },
      detail: { height: 350 },
    },
    outcomeIcons: {
      pending: { glyph: "…", glyphY: 132, halo: { r: 1, g: 244 / 255, b: 230 / 255 } },
      failure: { glyph: "×", glyphY: 132, halo: { r: 253 / 255, g: 236 / 255, b: 239 / 255 } },
    },
  };
  return String.raw`// @controlmux write guarded Luma Bank repair
const REPAIR = ${JSON.stringify(config)};
function controlId(node) { return node.getSharedPluginData(REPAIR.namespace, "control-id"); }
function inPage(node, pageId) { let current = node; while (current && current.type !== "PAGE") current = current.parent; return current && current.id === pageId; }
async function resolveNode(id, type, pageId, label) { const node = await figmaPlugin.resolveNode(id, type); figmaPlugin.assert(node && node.type === type, label + " must be a " + type); figmaPlugin.assert(inPage(node, pageId), label + " is outside the pinned page"); return node; }
function exactChild(root, predicate, label) { const matches = root.findAll(predicate); figmaPlugin.assert(matches.length === 1, label + " must resolve exactly once; found " + matches.length); return matches[0]; }
function exactDirectChild(root, predicate, label) { const matches = root.children.filter(predicate); figmaPlugin.assert(matches.length === 1, label + " must resolve exactly once; found " + matches.length); return matches[0]; }
async function loadTextFonts(node) { if (node.characters.length === 0) return; const fonts = node.getRangeAllFontNames(0, node.characters.length); const seen = new Set(); for (const font of fonts) { const key = font.family + "\u0000" + font.style; if (!seen.has(key)) { seen.add(key); await figma.loadFontAsync(font); } } }
async function statusInstance(root, componentIds, label) { const instances = root.findAll(function (node) { return node.type === "INSTANCE"; }); const matches = []; for (const instance of instances) { const main = await instance.getMainComponentAsync(); if (main && componentIds.has(main.id)) matches.push(instance); } figmaPlugin.assert(matches.length === 1, label + " must contain exactly one status-chip instance; found " + matches.length); return matches[0]; }

const raw = figma.root.getSharedPluginData(REPAIR.namespace, REPAIR.registryKey);
figmaPlugin.assert(raw, "The requested Luma registry key is absent");
const registry = JSON.parse(raw);
figmaPlugin.assert(registry && registry.schemaVersion === 1 && registry.project === "Luma Bank", "The requested registry is not the Luma schema-v1 registry");
for (const role of ["system", "screens", "flow"]) {
  const page = await figmaPlugin.loadPage(REPAIR.pageIds[role]);
  figmaPlugin.assert(page && page.type === "PAGE" && page.name === REPAIR.pageNames[role], "Pinned " + role + " page name drifted");
  figmaPlugin.assert(registry.pages && registry.pages[role] && registry.pages[role].id === page.id && registry.pages[role].name === page.name, "Registry " + role + " page identity drifted");
}
figmaPlugin.assert(registry.components && registry.components.status && registry.components.status.setId, "Status component registry is incomplete");
figmaPlugin.assert(registry.states && registry.states.loginError && registry.states.pending && registry.states.failure, "Required state registry is incomplete");
for (const key of ["share", "lock", "goal", "detail"]) figmaPlugin.assert(registry.overlays && registry.overlays[key] && registry.overlays[key].id, "Overlay registry is missing " + key);

const statusSet = await resolveNode(registry.components.status.setId, "COMPONENT_SET", REPAIR.pageIds.system, "Feedback/Status Chip");
figmaPlugin.assert(statusSet.name === "Feedback/Status Chip", "Status component-set name drifted");
const statusComponents = {};
for (const tone of Object.keys(REPAIR.fixedStatusLabels)) {
  const id = registry.components.status.variants && registry.components.status.variants["Tone=" + tone];
  figmaPlugin.assert(typeof id === "string" && id.length > 0, "Status registry is missing Tone=" + tone);
  const component = await resolveNode(id, "COMPONENT", REPAIR.pageIds.system, "Status Tone=" + tone);
  figmaPlugin.assert(component.parent && component.parent.id === statusSet.id && component.name === "Tone=" + tone, "Status Tone=" + tone + " is outside the pinned set or renamed");
  const label = exactChild(component, function (node) { return node.type === "TEXT" && (node.name === "label" || controlId(node).endsWith("/label")); }, "Status Tone=" + tone + " label");
  await loadTextFonts(label);
  statusComponents[tone] = { component, label };
}
const labelPropertyKeys = Object.entries(statusSet.componentPropertyDefinitions).filter(function (entry) { return entry[1].type === "TEXT" && entry[0].split("#")[0].trim().toLowerCase() === "label"; }).map(function (entry) { return entry[0]; });

const loginError = await resolveNode(registry.states.loginError.id, "FRAME", REPAIR.pageIds.screens, "Login-error state");
const forgot = exactChild(loginError, function (node) { return node.name === "forgot"; }, "Login-error forgot action");
const submit = exactChild(loginError, function (node) { return node.type === "INSTANCE" && node.name === "Instance / Controls/Button / Đăng nhập"; }, "Login-error submit button");
const face = exactChild(loginError, function (node) { return node.name === "Action / Face ID"; }, "Login-error Face ID action");
const trusted = exactChild(loginError, function (node) { return node.name === "Trusted device note"; }, "Login-error trusted-device note");

const pending = await resolveNode(registry.states.pending.id, "FRAME", REPAIR.pageIds.screens, "Pending state");
const failure = await resolveNode(registry.states.failure.id, "FRAME", REPAIR.pageIds.screens, "Failure state");
const componentIds = new Set(Object.values(statusComponents).map(function (item) { return item.component.id; }));
const pendingStatus = await statusInstance(pending, componentIds, "Pending state");
const failureStatus = await statusInstance(failure, componentIds, "Failure state");
const pendingHalo = exactChild(pending, function (node) { return node.type === "ELLIPSE" && (node.name === "success halo" || node.name === "pending halo"); }, "Pending outcome halo");
const pendingGlyph = exactChild(pending, function (node) { return node.type === "TEXT" && (node.name === "check" || node.name === "pending glyph"); }, "Pending outcome glyph");
const failureHalo = exactChild(failure, function (node) { return node.type === "ELLIPSE" && (node.name === "success halo" || node.name === "failure halo"); }, "Failure outcome halo");
const failureGlyph = exactChild(failure, function (node) { return node.type === "TEXT" && (node.name === "check" || node.name === "failure glyph"); }, "Failure outcome glyph");
await loadTextFonts(pendingGlyph); await loadTextFonts(failureGlyph);

const overlayNodes = {}; const scrimNodes = {};
for (const key of Object.keys(REPAIR.overlaySpecs)) {
  const overlay = await resolveNode(registry.overlays[key].id, "FRAME", REPAIR.pageIds.screens, "Overlay " + key);
  figmaPlugin.assert(controlId(overlay) === "luma/overlay/" + key, "Overlay " + key + " control identity drifted");
  const parent = overlay.parent; figmaPlugin.assert(parent && (parent.type === "SECTION" || parent.type === "FRAME"), "Overlay " + key + " parent is unavailable");
  const scrim = exactDirectChild(parent, function (node) { return node.type === "RECTANGLE" && controlId(node) === "luma/overlay/" + key + "/scrim"; }, "Overlay " + key + " sibling scrim");
  overlayNodes[key] = overlay; scrimNodes[key] = scrim;
}
const lockCancel = exactChild(overlayNodes.lock, function (node) { return node.name === "Action / Cancel"; }, "Lock cancel action");
const lockConfirm = exactChild(overlayNodes.lock, function (node) { return node.name === "Action / Confirm Lock"; }, "Lock confirm action");
const goalCancel = exactChild(overlayNodes.goal, function (node) { return node.name === "Action / Cancel"; }, "Goal cancel action");
const goalConfirm = exactChild(overlayNodes.goal, function (node) { return node.name === "Action / Confirm Goal"; }, "Goal confirm action");

for (const tone of Object.keys(REPAIR.fixedStatusLabels)) {
  const item = statusComponents[tone];
  const refs = item.label.componentPropertyReferences || {};
  if (refs.characters && labelPropertyKeys.includes(refs.characters)) item.label.componentPropertyReferences = {};
  item.label.characters = REPAIR.fixedStatusLabels[tone];
}
for (const propertyKey of labelPropertyKeys) statusSet.deleteComponentProperty(propertyKey);
figmaPlugin.assert(!Object.entries(statusSet.componentPropertyDefinitions).some(function (entry) { return entry[1].type === "TEXT" && entry[0].split("#")[0].trim().toLowerCase() === "label"; }), "Shared status Label property still exists after deletion");

pendingStatus.swapComponent(statusComponents.Pending.component); pendingStatus.name = "Instance / Feedback/Status Chip / Tone=Pending";
failureStatus.swapComponent(statusComponents.Error.component); failureStatus.name = "Instance / Feedback/Status Chip / Tone=Error";
pendingHalo.name = "pending halo"; pendingHalo.fills = [{ type: "SOLID", color: REPAIR.outcomeIcons.pending.halo }];
pendingGlyph.name = "pending glyph"; pendingGlyph.characters = REPAIR.outcomeIcons.pending.glyph; pendingGlyph.y = REPAIR.outcomeIcons.pending.glyphY;
failureHalo.name = "failure halo"; failureHalo.fills = [{ type: "SOLID", color: REPAIR.outcomeIcons.failure.halo }];
failureGlyph.name = "failure glyph"; failureGlyph.characters = REPAIR.outcomeIcons.failure.glyph; failureGlyph.y = REPAIR.outcomeIcons.failure.glyphY;
forgot.y = REPAIR.loginY.forgot; submit.y = REPAIR.loginY.submit; face.y = REPAIR.loginY.face; trusted.y = REPAIR.loginY.trusted;

for (const key of Object.keys(REPAIR.overlaySpecs)) {
  const overlay = overlayNodes[key]; const scrim = scrimNodes[key]; const spec = REPAIR.overlaySpecs[key];
  overlay.resize(overlay.width, spec.height); scrim.resize(overlay.width + 24, spec.height + 24);
  scrim.x = overlay.x - 12; scrim.y = overlay.y - 12;
  registry.overlays[key] = Object.assign({}, registry.overlays[key], { id: overlay.id, name: overlay.name, width: overlay.width, height: overlay.height, scrimId: scrim.id });
}
lockCancel.y = REPAIR.overlaySpecs.lock.actionsY; lockConfirm.y = REPAIR.overlaySpecs.lock.actionsY;
goalCancel.y = REPAIR.overlaySpecs.goal.actionsY; goalConfirm.y = REPAIR.overlaySpecs.goal.actionsY;

registry.components.status.properties = {};
registry.components.status.variants = Object.fromEntries(Object.entries(statusComponents).map(function (entry) { return ["Tone=" + entry[0], entry[1].component.id]; }));
registry.states.pending = Object.assign({}, registry.states.pending, { statusInstanceId: pendingStatus.id, statusTone: "Pending" });
registry.states.failure = Object.assign({}, registry.states.failure, { statusInstanceId: failureStatus.id, statusTone: "Error" });
registry.evidence = registry.evidence || {};
registry.evidence.targetedRepair = {
  schemaVersion: 1,
  bundleRevision: ${JSON.stringify(EXPECTED_BUNDLE_REVISION)},
  removedStatusLabelProperties: labelPropertyKeys,
  fixedStatusLabels: REPAIR.fixedStatusLabels,
  loginY: REPAIR.loginY,
  outcomeIcons: {
    pending: { haloId: pendingHalo.id, glyphId: pendingGlyph.id, glyph: pendingGlyph.characters, glyphY: pendingGlyph.y },
    failure: { haloId: failureHalo.id, glyphId: failureGlyph.id, glyph: failureGlyph.characters, glyphY: failureGlyph.y },
  },
  overlays: Object.fromEntries(Object.keys(REPAIR.overlaySpecs).map(function (key) { return [key, { id: overlayNodes[key].id, height: overlayNodes[key].height, scrimId: scrimNodes[key].id, scrimHeight: scrimNodes[key].height }]; })),
};
registry.updatedAt = Date.now();
figma.root.setSharedPluginData(REPAIR.namespace, REPAIR.registryKey, JSON.stringify(registry));
const undo = figmaPlugin.commitUndoCheckpoint("Repair Luma semantic states and compact overlays", {
  statusSetId: statusSet.id,
  stateIds: [loginError.id, pending.id, failure.id],
  overlayIds: Object.values(overlayNodes).map(function (node) { return node.id; }),
});
return {
  registry: { namespace: REPAIR.namespace, key: REPAIR.registryKey },
  pageIds: REPAIR.pageIds,
  status: {
    setId: statusSet.id,
    removedLabelPropertyKeys: labelPropertyKeys,
    remainingPropertyDefinitions: statusSet.componentPropertyDefinitions,
    fixedLabels: Object.fromEntries(Object.entries(statusComponents).map(function (entry) { return [entry[0], { componentId: entry[1].component.id, labelId: entry[1].label.id, characters: entry[1].label.characters }]; })),
  },
  loginError: { id: loginError.id, y: { forgot: forgot.y, submit: submit.y, face: face.y, trusted: trusted.y } },
  states: { pending: { id: pending.id, statusInstanceId: pendingStatus.id, mainComponentId: statusComponents.Pending.component.id, haloId: pendingHalo.id, haloName: pendingHalo.name, glyphId: pendingGlyph.id, glyphName: pendingGlyph.name, glyph: pendingGlyph.characters, glyphY: pendingGlyph.y }, failure: { id: failure.id, statusInstanceId: failureStatus.id, mainComponentId: statusComponents.Error.component.id, haloId: failureHalo.id, haloName: failureHalo.name, glyphId: failureGlyph.id, glyphName: failureGlyph.name, glyph: failureGlyph.characters, glyphY: failureGlyph.y } },
  overlays: Object.fromEntries(Object.keys(overlayNodes).map(function (key) { return [key, { id: overlayNodes[key].id, width: overlayNodes[key].width, height: overlayNodes[key].height, scrimId: scrimNodes[key].id, scrimWidth: scrimNodes[key].width, scrimHeight: scrimNodes[key].height }]; })),
  motion: registry.motion,
  undo,
};`;
}

async function waitForPinnedCompanion(runtime, journal, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() <= deadline) {
    try {
      const raw = await runtime.callRaw("figma_status", { verbose: true }, 20_000);
      const status = unwrapToolPayload(textPayload(raw));
      last = status;
      await journal.write("wait-for-companion", raw.isError === true ? "ERROR" : "OBSERVED", sanitizeResult(status));
      if (raw.isError !== true && isExactCompanion(status)) return status;
    } catch (error) {
      last = { error: serializeError(error) };
      await journal.write("wait-for-companion", "INCONCLUSIVE", last);
    }
    await delay(STATUS_POLL_MS);
  }
  throw new WorkflowError("BLOCKED", `No single exact 0.7 companion with bundle ${EXPECTED_BUNDLE_REVISION} became available within ${timeoutMs}ms.`, { lastStatus: last });
}

function isExactCompanion(status) {
  if (!status || status.pluginConnected !== true || !String(status.serverVersion ?? "").startsWith(EXPECTED_SERVER_PREFIX) || status.protocolVersion !== EXPECTED_PROTOCOL_VERSION || status.bundleRevision !== EXPECTED_BUNDLE_REVISION) return false;
  const instances = Array.isArray(status.instances) ? status.instances : [];
  if (instances.length !== 1) return false;
  const instance = instances[0];
  return instance.bundleRevision === EXPECTED_BUNDLE_REVISION && Array.isArray(instance.runtimeSdks) && instance.runtimeSdks.includes("v2");
}

async function assertPinnedRuntime(runtime, journal, pinned, stepId, requireIdle = false) {
  const raw = await runtime.callRaw("figma_status", { verbose: true }, 20_000);
  const status = unwrapToolPayload(textPayload(raw));
  await journal.write(stepId, raw.isError === true ? "ERROR" : "OBSERVED", sanitizeResult(status));
  if (raw.isError === true) throw toolFailure(stepId, "figma_status", status);
  const instance = status.instances?.find((candidate) => candidate.instanceId === pinned.instanceId);
  assert(status.pluginConnected === true && instance, `Pinned Figma instance ${pinned.instanceId} is not connected.`);
  assert(status.serverVersion === pinned.serverVersion && status.protocolVersion === EXPECTED_PROTOCOL_VERSION && status.bundleRevision === EXPECTED_BUNDLE_REVISION, "Pinned server identity drifted.");
  assert(instance.bundleRevision === EXPECTED_BUNDLE_REVISION && instance.fileName === pinned.fileName && (instance.fileKey ?? null) === pinned.fileKey, "Pinned file or companion identity drifted.");
  if (requireIdle) assert(status.queueLength === 0 && status.pendingCount === 0 && instance.inFlight === 0, "Pinned runtime is not idle.");
  return status;
}

function resolveExactLumaPages(inventory) {
  const pages = inventory?.pages;
  assert(Array.isArray(pages), "Typed file inventory returned no pages array.");
  assert(pages.length === 3, `Targeted Luma repair requires exactly three pages; inventory returned ${pages.length}.`);
  const result = {};
  for (const [role, expectedName] of Object.entries(EXPECTED_PAGE_NAMES)) {
    const matches = pages.filter((page) => page.name === expectedName);
    assert(matches.length === 1, `Expected exactly one page named ${expectedName}; found ${matches.length}.`);
    result[role] = matches[0].id;
  }
  assert(new Set(Object.values(result)).size === 3, "Exact Luma page names did not resolve to three distinct IDs.");
  return result;
}

function validateRepairResult(result, expectedPageIds, expectedRegistryKey) {
  assert(result?.registry?.namespace === REGISTRY_NAMESPACE && result?.registry?.key === expectedRegistryKey, "Repair returned the wrong registry identity.");
  assert(sameRecord(result.pageIds, expectedPageIds), "Repair returned page IDs that differ from the pinned file.");
  assert(result?.status?.setId && result.status.remainingPropertyDefinitions && !Object.entries(result.status.remainingPropertyDefinitions).some(([key, value]) => value?.type === "TEXT" && key.split("#")[0].trim().toLowerCase() === "label"), "Status Label property remains after repair.");
  const expectedLabels = { Success: "Hoàn tất", Pending: "Đang xử lý", Error: "Thất bại", Info: "Cần OTP" };
  for (const [tone, label] of Object.entries(expectedLabels)) assert(result.status.fixedLabels?.[tone]?.characters === label, `Status Tone=${tone} did not return its fixed label.`);
  assert(result?.states?.pending?.mainComponentId === result.status.fixedLabels.Pending.componentId, "Pending screen was not swapped to Tone=Pending.");
  assert(result?.states?.failure?.mainComponentId === result.status.fixedLabels.Error.componentId, "Failure screen was not swapped to Tone=Error.");
  assert(result?.states?.pending?.haloName === "pending halo" && result?.states?.pending?.glyphName === "pending glyph" && result?.states?.pending?.glyph === "…" && result?.states?.pending?.glyphY === 132, "Pending outcome icon did not receive its non-success semantics.");
  assert(result?.states?.failure?.haloName === "failure halo" && result?.states?.failure?.glyphName === "failure glyph" && result?.states?.failure?.glyph === "×" && result?.states?.failure?.glyphY === 132, "Failure outcome icon did not receive its non-success semantics.");
  assert(sameRecord(result?.loginError?.y, { forgot: 480, submit: 524, face: 594, trusted: 664 }), "Login-error y positions do not match the requested repair.");
  for (const [key, height] of Object.entries({ share: 330, lock: 280, goal: 350, detail: 350 })) {
    const overlay = result?.overlays?.[key];
    assert(overlay?.height === height && overlay?.scrimHeight === height + 24 && overlay?.scrimWidth === overlay?.width + 24, `Overlay ${key} or its sibling scrim has the wrong compact dimensions.`);
  }
  assert(typeof result?.motion?.success?.id === "string" && result.motion.success.id.length > 0, "Repair registry returned no success-motion specimen for the export-integrity probe.");
  assert(result?.undo, "Repair did not return a committed undo checkpoint.");
}

function repairTargets(result, pageIds) {
  const targets = [
    { key: "status-set", nodeId: result.status.setId, pageId: pageIds.system },
    { key: "login-error", nodeId: result.loginError.id, pageId: pageIds.screens },
    { key: "pending", nodeId: result.states.pending.id, pageId: pageIds.screens },
    { key: "failure", nodeId: result.states.failure.id, pageId: pageIds.screens },
    ...["share", "lock", "goal", "detail"].map((key) => ({ key: `overlay-${key}`, nodeId: result.overlays[key].id, pageId: pageIds.screens })),
  ];
  assert(targets.length === 8 && targets.every((target) => typeof target.nodeId === "string" && target.nodeId.length > 0), "Repair did not return all eight material target IDs.");
  return targets;
}

async function query(runtime, journal, pinned, traceRoot, planId, stepId, kind, extra = {}) {
  const { routePageId = pinned.initialPageId, ...queryParams } = extra;
  return toolStep(runtime, journal, stepId, "figma_query", {
    kind,
    ...queryParams,
    instanceId: pinned.instanceId,
    pageId: routePageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:${stepId}`,
    attempt: 1,
    operation: operation(planId, stepId, `Capture ${kind} repair evidence`, "read", "verify", `${pinned.fileName} / pinned Luma file`, kind === "structure" ? "tree" : "table", ["Facts are bound to the exact pinned companion and file"]),
  });
}

async function toolStep(runtime, journal, stepId, tool, args, timeout = NORMAL_TIMEOUT_MS) {
  let raw;
  try {
    raw = await runtime.callRaw(tool, args, timeout);
  } catch (error) {
    const failure = new WorkflowError(tool === "figma_exec" ? "INCONCLUSIVE" : "BLOCKED", `${tool} transport failed during ${stepId}.`, { tool, stepId, providerStateUnknown: tool === "figma_exec", cause: serializeError(error) });
    await journal.write(stepId, failure.state, failure.details);
    throw failure;
  }
  const payload = unwrapToolPayload(textPayload(raw));
  await journal.write(stepId, raw.isError === true ? "ERROR" : "OBSERVED", { tool, traceId: args.traceId ?? null, result: sanitizeResult(payload), structuredContent: sanitizeResult(raw.structuredContent ?? null) });
  if (raw.isError === true) throw toolFailure(stepId, tool, payload);
  return payload;
}

async function mutationStep(runtime, journal, stepId, tool, args, timeout, reconcile) {
  try {
    return await toolStep(runtime, journal, stepId, tool, args, timeout);
  } catch (error) {
    if (error instanceof WorkflowError && (error.details?.providerStateUnknown === true || error.details?.possiblyCommitted === true)) {
      try { await reconcile(error); } catch (reconcileError) { await journal.write(`${stepId}-reconcile-failure`, "INCONCLUSIVE", { error: serializeError(reconcileError) }); }
    }
    throw error;
  }
}

async function reconcileAmbiguousMutation(runtime, journal, pinned, traceRoot, planId, failure) {
  await journal.write("repair-reconcile-start", "INCONCLUSIVE", { failure: serializeError(failure) });
  try { await assertPinnedRuntime(runtime, journal, pinned, "repair-reconcile-status"); } catch {}
  try { await query(runtime, journal, pinned, traceRoot, planId, "repair-reconcile-manifest", "artifact_manifest", { refresh: true }); } catch {}
  try { await query(runtime, journal, pinned, traceRoot, planId, "repair-reconcile-inventory", "file_inventory"); } catch {}
}

async function collectCompleteComponentIntegrity(runtime, journal, pinned, traceRoot, planId) {
  const delivered = [];
  const graphPages = [];
  let componentTotal = null;
  let cursor;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const result = await query(runtime, journal, pinned, traceRoot, planId, `post-component-integrity-${pageIndex + 1}`, "component_integrity", {
      scope: "document",
      ...(cursor ? { cursor } : { refresh: true }),
      limit: 1_000,
    });
    const ids = componentIds(result);
    assert(result?.facts?.componentCoverage?.alignedTo === "graph_page", "Complete component-integrity readback is not aligned to graph pages.");
    assert(result.facts.componentCoverage.returned === ids.length, "Complete component-integrity returned-count metadata does not match the delivered facts.");
    if (componentTotal === null) componentTotal = result.facts.componentCoverage.total;
    else assert(result.facts.componentCoverage.total === componentTotal, "Complete component-integrity total drifted between pages.");
    graphPages.push(sanitizeResult(result.coverage));
    delivered.push(...result.facts.components);
    if (result?.coverage?.truncated !== true) break;
    assert(typeof result.coverage.nextCursor === "string" && result.coverage.nextCursor.length > 0, "Truncated component-integrity page returned no cursor.");
    cursor = result.coverage.nextCursor;
  }
  assert(graphPages.length > 0 && graphPages.at(-1)?.truncated === false, "Complete component-integrity readback exceeded the pagination guard.");
  const ids = delivered.map((item) => item?.id).filter((id) => typeof id === "string");
  assert(new Set(ids).size === ids.length, "Complete component-integrity readback repeated component facts across pages.");
  const graphTotal = graphPages[0]?.total;
  const graphReturned = graphPages.reduce((sum, page) => sum + Number(page?.returned ?? 0), 0);
  assert(Number.isFinite(graphTotal) && graphReturned === graphTotal, `Complete component-integrity graph coverage returned ${graphReturned} of ${graphTotal}.`);
  const result = {
    componentCount: delivered.length,
    componentIds: ids,
    graphCoverage: { total: graphTotal, returned: graphReturned, pages: graphPages },
    facts: delivered,
  };
  assert(Number.isFinite(componentTotal) && delivered.length === componentTotal, `Complete component-integrity delivered ${delivered.length} of ${componentTotal} component facts.`);
  await journal.write("post-component-integrity-complete", "OBSERVED", { componentCount: delivered.length, graphCoverage: result.graphCoverage });
  return result;
}

async function probeTypedPagination({ runtime, journal, pinned, traceRoot, planId }) {
  const componentFirst = await query(runtime, journal, pinned, traceRoot, planId, "probe-component-page-1", "component_integrity", {
    scope: "document",
    refresh: true,
    limit: 500,
  });
  assert(componentFirst?.coverage?.truncated === true && typeof componentFirst.coverage.nextCursor === "string", "Component pagination probe did not produce a second graph page.");
  const componentSecond = await query(runtime, journal, pinned, traceRoot, planId, "probe-component-page-2", "component_integrity", {
    scope: "document",
    cursor: componentFirst.coverage.nextCursor,
    limit: 500,
  });
  const firstComponentIds = componentIds(componentFirst);
  const secondComponentIds = componentIds(componentSecond);
  assert(componentFirst?.facts?.componentCoverage?.alignedTo === "graph_page" && componentSecond?.facts?.componentCoverage?.alignedTo === "graph_page", "Component pagination facts are not aligned to graph pages.");
  assert(componentFirst.facts.componentCoverage.returned === firstComponentIds.length && componentSecond.facts.componentCoverage.returned === secondComponentIds.length, "Component pagination returned-count metadata does not match the delivered facts.");
  assert(componentFirst.facts.componentCoverage.total === componentSecond.facts.componentCoverage.total, "Component pagination total drifted between pages.");
  assert(firstComponentIds.some((id) => !secondComponentIds.includes(id)), "Component pagination probe did not distinguish the first and second graph pages.");
  assert(firstComponentIds.every((id) => !secondComponentIds.includes(id)), "Component pagination repeated component facts across graph pages.");

  const bindingFirst = await query(runtime, journal, pinned, traceRoot, planId, "probe-binding-page-1", "binding_inventory", {
    scope: "document",
    refresh: true,
    limit: 500,
  });
  assert(bindingFirst?.coverage?.truncated === true && typeof bindingFirst.coverage.nextCursor === "string", "Binding pagination probe did not produce a second graph page.");
  const bindingSecond = await query(runtime, journal, pinned, traceRoot, planId, "probe-binding-page-2", "binding_inventory", {
    scope: "document",
    cursor: bindingFirst.coverage.nextCursor,
    limit: 500,
  });
  const firstDelivery = bindingFirst?.facts?.inventoryDelivery;
  const secondDelivery = bindingSecond?.facts?.inventoryDelivery;
  assert(firstDelivery?.mode === "first_graph_page_only" && firstDelivery.included === true, "Binding inventory was not delivered on the first graph page.");
  assert(secondDelivery?.mode === "first_graph_page_only" && secondDelivery.included === false, "Binding inventory was repeated after the first graph page.");
  assert(Array.isArray(bindingFirst?.facts?.variables) && bindingFirst.facts.variables.length > 0 && Array.isArray(bindingFirst?.facts?.styles) && bindingFirst.facts.styles.length > 0, "First binding page returned no variables or styles.");
  assert(Array.isArray(bindingSecond?.facts?.variables) && bindingSecond.facts.variables.length === 0 && Array.isArray(bindingSecond?.facts?.styles) && bindingSecond.facts.styles.length === 0, "Second binding page repeated invariant variable or style facts.");
  assert(firstDelivery.variables?.returned === bindingFirst.facts.variables.length && firstDelivery.styles?.returned === bindingFirst.facts.styles.length, "First binding-page delivery metadata does not match the returned inventories.");
  assert(secondDelivery.variables?.returned === 0 && secondDelivery.styles?.returned === 0, "Second binding-page delivery metadata claims invariant facts were returned.");
  assert(firstDelivery.variables?.total === secondDelivery.variables?.total && firstDelivery.styles?.total === secondDelivery.styles?.total, "Binding inventory totals drifted between graph pages.");

  const result = {
    componentIntegrity: {
      total: componentFirst.facts.componentCoverage.total,
      page1: { graph: sanitizeResult(componentFirst.coverage), componentCount: firstComponentIds.length, componentIds: firstComponentIds },
      page2: { graph: sanitizeResult(componentSecond.coverage), componentCount: secondComponentIds.length, componentIds: secondComponentIds },
      repeatedIds: firstComponentIds.filter((id) => secondComponentIds.includes(id)),
    },
    bindingInventory: {
      page1: sanitizeResult(firstDelivery),
      page2: sanitizeResult(secondDelivery),
      page1VariableCount: bindingFirst.facts.variables.length,
      page1StyleCount: bindingFirst.facts.styles.length,
      page2VariableCount: bindingSecond.facts.variables.length,
      page2StyleCount: bindingSecond.facts.styles.length,
    },
  };
  await journal.write("probe-typed-pagination-result", "OBSERVED", result);
  return result;
}

function componentIds(result) {
  const components = result?.facts?.components;
  assert(Array.isArray(components), "Component-integrity page returned no components array.");
  return components.map((item) => item?.id).filter((id) => typeof id === "string");
}

async function probeExportIntegrity({ runtime, journal, pinned, traceRoot, planId, evidenceDir, runId, nodeId, pageId }) {
  const stepId = "probe-motion-export-integrity";
  const raw = await runtime.callRaw("figma_export", {
    nodeId,
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
    contentsOnly: true,
    colorProfile: "SRGB",
    maxBytes: 32 * 1024 * 1024,
    filename: `${runId}-motion-export-integrity-probe`,
    instanceId: pinned.instanceId,
    pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:${stepId}`,
    attempt: 1,
    operation: operation(planId, stepId, "Probe server-side PNG dimension integrity on an animated Motion specimen", "export", "verify", `${pinned.fileName} / ${nodeId}`, "artifact", ["A valid raster is persisted with actual pixel dimensions, or a mismatched 1x1 provider raster is rejected before persistence"]),
  }, EXPORT_TIMEOUT_MS);
  const payload = unwrapToolPayload(textPayload(raw));
  if (raw.isError === true) {
    const disposition = payload?.error && typeof payload.error === "object" ? payload.error : payload;
    const message = `${disposition?.code ?? ""} ${disposition?.message ?? ""} ${disposition?.hint ?? ""}`;
    assert(disposition?.code === "INTERNAL" && /returned a 1x1 PNG/i.test(message) && /not persisted/i.test(message), `Motion export failed for an unrelated reason: ${message}`);
    const result = { state: "REJECTED_INVALID_RASTER", nodeId, pageId, error: sanitizeResult(disposition) };
    await journal.write(stepId, "OBSERVED", result);
    return result;
  }

  const artifact = raw.structuredContent?.artifact ?? payload?.artifact ?? payload;
  assert(typeof artifact?.path === "string" && artifact.path.length > 0, "Successful motion export probe returned no artifact path.");
  const evidencePath = resolve(evidenceDir, `luma-realistic-repair-${runId}-motion-export-integrity-probe.png`);
  await copyFile(artifact.path, evidencePath);
  const bytes = await readFile(evidencePath);
  const png = inspectPng(bytes);
  assert(png.width > 1 && png.height > 1, `Motion export probe persisted invalid ${png.width}x${png.height} dimensions.`);
  assert(artifact.actualPixelWidth === png.width && artifact.actualPixelHeight === png.height, "Motion export metadata does not match decoded PNG dimensions.");
  const result = {
    state: "VALID_RASTER",
    nodeId,
    pageId,
    evidencePath,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    png,
    artifact: sanitizeResult(artifact),
  };
  await journal.write(stepId, "OBSERVED", result);
  return result;
}

async function exportEvidence({ runtime, journal, pinned, traceRoot, planId, evidenceDir, runId, target, index }) {
  const stepId = `export-${index + 1}-${target.key}`;
  const raw = await runtime.callRaw("figma_export", {
    nodeId: target.nodeId,
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
    contentsOnly: true,
    colorProfile: "SRGB",
    maxBytes: 32 * 1024 * 1024,
    filename: `${runId}-${target.key}`,
    instanceId: pinned.instanceId,
    pageId: target.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:${stepId}`,
    attempt: 1,
    operation: operation(planId, stepId, `Export repaired ${target.key}`, "export", "verify", `${pinned.fileName} / ${target.nodeId}`, "artifact", ["Persisted PNG has decoded width and height greater than one pixel"]),
  }, EXPORT_TIMEOUT_MS);
  const payload = unwrapToolPayload(textPayload(raw));
  const artifact = raw.structuredContent?.artifact ?? payload?.artifact ?? payload;
  await journal.write(stepId, raw.isError === true ? "ERROR" : "OBSERVED", { result: sanitizeResult(payload), artifact: sanitizeResult(artifact) });
  if (raw.isError === true) throw toolFailure(stepId, "figma_export", payload);
  assert(typeof artifact?.path === "string" && artifact.path.length > 0, `Export ${target.key} returned no artifact path.`);
  const evidencePath = resolve(evidenceDir, `luma-realistic-repair-${runId}-${String(index + 1).padStart(2, "0")}-${target.key}.png`);
  await copyFile(artifact.path, evidencePath);
  const bytes = await readFile(evidencePath);
  const png = inspectPng(bytes);
  assert(png.width > 1 && png.height > 1, `Export ${target.key} decoded to invalid ${png.width}x${png.height} dimensions.`);
  assert(artifact.actualPixelWidth === png.width && artifact.actualPixelHeight === png.height, `Export ${target.key} metadata does not match decoded PNG dimensions.`);
  const persisted = {
    key: target.key,
    nodeId: target.nodeId,
    pageId: target.pageId,
    evidencePath,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    png,
    artifact: sanitizeResult(artifact),
  };
  await journal.write(`${stepId}-persisted`, "OBSERVED", persisted);
  return persisted;
}

function inspectPng(bytes) {
  assert(bytes.length >= 24, "PNG evidence is shorter than its header.");
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert(signature.every((value, index) => bytes[index] === value), "Export evidence is not a PNG file.");
  assert(bytes.toString("ascii", 12, 16) === "IHDR", "PNG evidence has no leading IHDR chunk.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function operation(planId, stepId, label, kind, phase, target, representation, postconditions) {
  return { label, kind, phase, planId, stepId, target, representation, postconditions };
}

function requiredOption(name) {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) {
    const value = equals.slice(name.length + 1).trim();
    assert(value.length > 0, `${name} requires a non-empty value.`);
    return value;
  }
  const index = process.argv.indexOf(name);
  assert(index >= 0 && typeof process.argv[index + 1] === "string" && !process.argv[index + 1].startsWith("--"), `${name} is required. Example: ${name}=luma-realistic-rebuild:<run-id>`);
  const value = process.argv[index + 1].trim();
  assert(value.length > 0, `${name} requires a non-empty value.`);
  return value;
}

function toolFailure(stepId, tool, payload) {
  const disposition = payload?.error && typeof payload.error === "object" ? payload.error : payload;
  const state = disposition?.possiblyCommitted === true || disposition?.providerStateUnknown === true ? "INCONCLUSIVE" : "FAIL";
  return new WorkflowError(state, `${tool} failed during ${stepId}: ${disposition?.code ?? "UNKNOWN"}: ${disposition?.message ?? JSON.stringify(disposition)}`, { tool, stepId, ...sanitizeResult(disposition) });
}

class WorkflowError extends Error {
  constructor(state, message, details = {}) {
    super(message);
    this.name = "WorkflowError";
    this.state = state;
    this.details = details;
  }
}

function classifyFailure(error) {
  return error instanceof WorkflowError && ["BLOCKED", "INCONCLUSIVE", "FAIL"].includes(error.state) ? error.state : "FAIL";
}

function createJournal(path, runId) {
  let sequence = 0;
  return {
    async write(stepId, state, data) {
      sequence += 1;
      await appendFile(path, `${JSON.stringify({ schemaVersion: 1, kind: "LumaRealisticRepairJournalEntry", runId, sequence, observedAt: new Date().toISOString(), stepId, state, data: sanitizeResult(data) })}\n`, { encoding: "utf8", flag: "a" });
    },
  };
}

function unwrapToolPayload(payload) {
  if (payload && payload.status === "success" && payload.result !== undefined) return payload.result;
  if (payload && payload.status === "error" && payload.error !== undefined) return payload.error;
  return payload;
}

function sanitizeResult(value, depth = 0) {
  if (depth > 16) return "[MaxDepth]";
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return value ?? null;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeResult(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "bytes" && key !== "base64").map(([key, item]) => [key, sanitizeResult(item, depth + 1)]));
  return String(value);
}

function serializeError(error) {
  if (error instanceof WorkflowError) return { name: error.name, state: error.state, message: error.message, details: sanitizeResult(error.details), stack: error.stack ?? null };
  if (error instanceof Error) return { name: error.name, state: "FAIL", message: error.message, stack: error.stack ?? null };
  return { name: "UnknownError", state: "FAIL", message: String(error) };
}

function sameRecord(left, right) {
  if (!left || !right) return false;
  const keys = Object.keys(right);
  return Object.keys(left).length === keys.length && keys.every((key) => left[key] === right[key]);
}

function compactTimestamp(value) {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

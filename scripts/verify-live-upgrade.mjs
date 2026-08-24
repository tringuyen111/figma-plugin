import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RuntimeClient, assert, textPayload } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "figma-live-upgrade-proof" });
const traceRoot = `full-plugin-upgrade-live:${Date.now()}`;
const planId = "full-plugin-upgrade-live-proof";
const proofId = `controlmux-live-proof-${Date.now()}`;
const marker = `ControlMux Live Proof ${proofId}`;
const evidenceDir = resolve("output/figma-evidence");
const evidenceImagePath = resolve(evidenceDir, "live-upgrade-proof-2026-08-24.png");
const evidenceJsonPath = resolve(evidenceDir, "live-upgrade-proof-2026-08-24.json");

let instance;
let createdNodeId;
let cleanup;

try {
  await runtime.connect();
  const status = await waitForConnected(runtime, 45_000);
  instance = runtime.resolveSingleInstance(status);
  assert(instance.bundleRevision === status.bundleRevision, `Companion bundle ${instance.bundleRevision} does not match server ${status.bundleRevision}.`);
  assert(instance.runtimeSdks?.includes("v2"), "Connected companion does not expose Runtime SDK v2.");
  const target = `${instance.fileName} / ${instance.pageName}`;

  const before = await exec({
    code: `
const matches = figma.currentPage.findAll(function (node) { return node.name === ${JSON.stringify(marker)}; });
return { pageId: figma.currentPage.id, pageName: figma.currentPage.name, topLevelCount: figma.currentPage.children.length, existingMatches: matches.length };
`,
    capability: "figma-verification",
    traceId: `${traceRoot}:before`,
    operation: operation({
      label: "Inspect target before bounded live proof",
      kind: "read",
      phase: "inspect",
      stepId: "inspect-before",
      target,
      representation: "table",
      postconditions: ["Exact page identity and absence of the unique proof fixture are returned"],
    }),
  });
  assert(before.pageId === instance.pageId, `Target page drifted from ${instance.pageId} to ${before.pageId}.`);
  assert(before.existingMatches === 0, "Unique live-proof marker already exists before mutation.");

  const inventoryBefore = await fileInventory("baseline", target);
  const targetPageBefore = inventoryBefore.pages?.find((page) => page.id === instance.pageId);
  assert(targetPageBefore, "Typed baseline inventory omitted the exact target page.");
  assert(targetPageBefore.childCount === before.topLevelCount, "Raw and typed baseline child counts disagree.");

  const createResult = await execRaw({
    code: `
const page = figma.currentPage;
const proofId = ${JSON.stringify(proofId)};
const marker = ${JSON.stringify(marker)};
const matches = page.children.filter(function (node) { return node.getPluginData("controlmuxProofId") === proofId; });
if (matches.length > 1) throw new Error("Duplicate live-proof roots for the same proof id");
if (matches.length === 1) {
  const existing = matches[0];
  if (existing.type !== "FRAME" || existing.name !== marker) throw new Error("Live-proof ownership token/name mismatch");
  return {
    created: false,
    nodeId: existing.id,
    pageId: page.id,
    name: existing.name,
    width: existing.width,
    height: existing.height,
    childCount: existing.children.length,
    proofId: existing.getPluginData("controlmuxProofId"),
    position: { x: existing.x, y: existing.y }
  };
}
const rightEdge = page.children.reduce(function (max, node) { return Math.max(max, node.x + node.width); }, 0);
const frame = figma.createFrame();
frame.name = marker;
frame.resize(360, 220);
frame.x = rightEdge + 120;
frame.y = 0;
frame.layoutMode = "VERTICAL";
frame.primaryAxisSizingMode = "FIXED";
frame.counterAxisSizingMode = "FIXED";
frame.paddingTop = 24;
frame.paddingRight = 24;
frame.paddingBottom = 24;
frame.paddingLeft = 24;
frame.itemSpacing = 16;
frame.cornerRadius = 24;
frame.clipsContent = true;
frame.fills = [{ type: "SOLID", color: { r: 0.055, g: 0.071, b: 0.102 } }];
frame.setPluginData("controlmuxProofId", proofId);

const header = figma.createRectangle();
header.name = "Accountable MCP Contract";
header.resize(312, 64);
header.cornerRadius = 16;
header.fills = [{ type: "SOLID", color: { r: 0.267, g: 0.384, b: 0.941 } }];
frame.appendChild(header);

const row = figma.createFrame();
row.name = "IN PROCESS OUT";
row.resize(312, 92);
row.layoutMode = "HORIZONTAL";
row.primaryAxisSizingMode = "FIXED";
row.counterAxisSizingMode = "FIXED";
row.itemSpacing = 12;
row.fills = [];
frame.appendChild(row);

const colors = [
  { r: 0.133, g: 0.773, b: 0.573 },
  { r: 0.957, g: 0.647, b: 0.212 },
  { r: 0.925, g: 0.333, b: 0.443 }
];
const names = ["IN", "PROCESS", "OUT"];
for (let index = 0; index < names.length; index += 1) {
  const card = figma.createRectangle();
  card.name = names[index];
  card.resize(96, 92);
  card.cornerRadius = 14;
  card.fills = [{ type: "SOLID", color: colors[index] }];
  row.appendChild(card);
}
const undoCheckpoint = figmaPlugin.commitUndoCheckpoint("full-plugin-upgrade-live-proof-create", { nodeId: frame.id, proofId });
return {
  created: true,
  nodeId: frame.id,
  pageId: page.id,
  name: frame.name,
  width: frame.width,
  height: frame.height,
  childCount: frame.children.length,
  proofId: frame.getPluginData("controlmuxProofId"),
  position: { x: frame.x, y: frame.y },
  undoCheckpoint
};
`,
    capability: "figma-native",
    traceId: `${traceRoot}:create`,
    operation: operation({
      label: "Create bounded disposable live-proof fixture",
      kind: "write",
      phase: "execute",
      stepId: "create-fixture",
      target,
      representation: "rendered-composition",
      postconditions: ["One uniquely identified 360x220 frame exists on the exact target page"],
    }),
  });
  if (createResult.isError === true) {
    const failure = textPayload(createResult);
    if (failure.possiblyCommitted === true || failure.providerStateUnknown === true) {
      const reconciliation = await probeFixtureByToken(target);
      if (typeof reconciliation.nodeId === "string") createdNodeId = reconciliation.nodeId;
    }
    throw new Error(`Live-proof creation failed: ${JSON.stringify(failure)}`);
  }
  const created = textPayload(createResult);
  createdNodeId = created.nodeId;
  assert(created.pageId === instance.pageId, "Created fixture landed on the wrong page.");
  assert(created.name === marker && created.width === 360 && created.height === 220, "Created fixture contract drifted.");
  assert(created.proofId === proofId && created.childCount === 2, "Created fixture identity or structure is incomplete.");

  let readback;
  let structure;
  let artifact;
  try {
    readback = await exec({
      code: `
const node = await figma.getNodeByIdAsync(${JSON.stringify(createdNodeId)});
if (!node || node.type !== "FRAME") throw new Error("Live-proof frame missing during readback");
return {
  id: node.id,
  name: node.name,
  type: node.type,
  pageId: node.parent ? node.parent.id : null,
  width: node.width,
  height: node.height,
  layoutMode: node.layoutMode,
  proofId: node.getPluginData("controlmuxProofId"),
  children: node.children.map(function (child) { return { id: child.id, name: child.name, type: child.type }; })
};
`,
      capability: "figma-verification",
      traceId: `${traceRoot}:readback`,
      operation: operation({
        label: "Read back exact live-proof fixture",
        kind: "read",
        phase: "verify",
        stepId: "readback-fixture",
        target: marker,
        representation: "tree",
        postconditions: ["Readback matches the unique node id, page, dimensions, structure, and plugin-data identity"],
      }),
    });
    assert(readback.id === createdNodeId && readback.pageId === instance.pageId, "Readback did not bind the exact created node and page.");
    assert(readback.proofId === proofId && readback.layoutMode === "VERTICAL", "Readback identity or layout contract failed.");
    assert(readback.children.map((child) => child.name).join("|") === "Accountable MCP Contract|IN PROCESS OUT", "Readback child structure drifted.");

    structure = await runtime.call("figma_query", {
      kind: "structure",
      nodeId: createdNodeId,
      includeChildren: true,
      instanceId: instance.instanceId,
      pageId: instance.pageId,
      capability: "figma-verification",
      traceId: `${traceRoot}:typed-structure`,
      attempt: 1,
      operation: operation({
        label: "Verify fixture through typed structure query",
        kind: "read",
        phase: "verify",
        stepId: "typed-structure",
        target: marker,
        representation: "tree",
        postconditions: ["Typed query returns the exact root with five descendants and two Auto Layout nodes"],
      }),
    });
    assert(structure.rootId === createdNodeId, "Typed structure query returned another root.");
    assert(structure.descendantCount === 5 && structure.autoLayoutNodeCount === 2, "Typed structure query did not observe the expected fixture graph.");

    const exported = await runtime.callRaw("figma_export", {
      nodeId: createdNodeId,
      format: "PNG",
      constraint: { type: "SCALE", value: 1 },
      contentsOnly: true,
      colorProfile: "SRGB",
      maxBytes: 32 * 1024 * 1024,
      filename: "figma-live-upgrade-proof-2026-08-24",
      instanceId: instance.instanceId,
      pageId: instance.pageId,
      capability: "figma-verification",
      traceId: `${traceRoot}:export`,
      attempt: 1,
      operation: operation({
        label: "Export exact verified live-proof fixture",
        kind: "export",
        phase: "verify",
        stepId: "export-fixture",
        target: marker,
        representation: "artifact",
        postconditions: ["Persisted PNG comes from the exact verified temporary frame"],
      }),
    }, 330_000);
    assert(exported.isError !== true, `figma_export failed: ${JSON.stringify(textPayload(exported))}`);
    artifact = exported.structuredContent?.artifact || textPayload(exported).artifact || {};
    assert(typeof artifact.path === "string" && artifact.path.length > 0, "Export returned no persisted artifact path.");
    assert(artifact.nodeId === createdNodeId && artifact.nodeName === marker, "Export metadata did not retain the exact verified node identity.");
    assert(artifact.naturalWidth === 360 && artifact.naturalHeight === 220 && artifact.byteLength > 0, "Export metadata dimensions or byte length are invalid.");
    await mkdir(evidenceDir, { recursive: true });
    await copyFile(artifact.path, evidenceImagePath);
  } finally {
    if (createdNodeId) cleanup = await removeFixture(createdNodeId, target);
  }

  assert(cleanup?.removed === true, "Temporary fixture cleanup did not remove the exact node.");
  const absence = await exec({
    code: `
const node = await figma.getNodeByIdAsync(${JSON.stringify(createdNodeId)});
const matches = figma.currentPage.findAll(function (candidate) { return candidate.name === ${JSON.stringify(marker)}; });
return { exists: Boolean(node), markerMatches: matches.length, pageId: figma.currentPage.id };
`,
    capability: "figma-verification",
    traceId: `${traceRoot}:absence`,
    operation: operation({
      label: "Verify disposable fixture cleanup",
      kind: "read",
      phase: "verify",
      stepId: "verify-cleanup",
      target,
      representation: "table",
      postconditions: ["Exact node id and unique marker are absent from the target page"],
    }),
  });
  assert(absence.exists === false && absence.markerMatches === 0, "Temporary fixture remains after cleanup.");

  const inventoryAfter = await fileInventory("after-cleanup", target);
  const targetPageAfter = inventoryAfter.pages?.find((page) => page.id === instance.pageId);
  assert(targetPageAfter, "Typed final inventory omitted the exact target page.");
  assert(targetPageAfter.childCount === targetPageBefore.childCount, "Target page child count did not return to baseline after cleanup.");
  assert(targetPageAfter.descendantCount === targetPageBefore.descendantCount, "Target page descendant count did not return to baseline after cleanup.");

  const after = await runtime.status(true);
  const afterInstance = after.instances?.find((candidate) => candidate.instanceId === instance.instanceId);
  assert(after.pluginConnected === true, "Companion disconnected before final status readback.");
  assert(after.bundleRevision === instance.bundleRevision && afterInstance?.pageId === instance.pageId, "Runtime identity drifted during live proof.");
  assert(after.queueLength === 0 && after.pendingCount === 0 && afterInstance?.inFlight === 0, "Runtime did not return to idle after live proof.");
  const imageBytes = await readFile(evidenceImagePath);
  const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
  const evidence = {
    schemaVersion: 1,
    kind: "live-full-plugin-upgrade-proof",
    observedAt: new Date().toISOString(),
    candidate: { packageVersion: after.serverVersion, bundleRevision: after.bundleRevision, protocolVersion: after.protocolVersion },
    target: { instanceId: instance.instanceId, fileName: instance.fileName, pageId: instance.pageId, pageName: instance.pageName, editorType: instance.editorType },
    traceRoot,
    fixture: { marker, proofId, inventoryBefore, created, readback, structure, cleanup, absence, inventoryAfter },
    export: { ...artifact, evidenceImagePath, imageSha256, byteLength: imageBytes.byteLength },
    finalRuntime: { pluginConnected: after.pluginConnected, queueLength: after.queueLength, pendingCount: after.pendingCount, instanceInFlight: afterInstance?.inFlight ?? null },
    scope: { liveReadWriteReadbackExport: "PASS", visualInspection: "PENDING", secureMcpTunnel: "NOT_RUN", behavioralComparison: "NOT_RUN" },
  };
  await writeFile(evidenceJsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ evidenceJsonPath, evidenceImagePath, imageSha256, target: evidence.target, finalRuntime: evidence.finalRuntime, scope: evidence.scope })}\n`);
} finally {
  if (createdNodeId && cleanup?.removed !== true && instance) {
    try { await removeFixture(createdNodeId, `${instance.fileName} / ${instance.pageName}`); } catch {}
  }
  await runtime.close();
}

async function waitForConnected(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let status;
  do {
    status = await client.status(true);
    if (status.pluginConnected) return status;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  } while (Date.now() < deadline);
  throw new Error(`No Figma companion connected within ${timeoutMs}ms.`);
}

function operation({ label, kind, phase, stepId, target, representation, postconditions }) {
  return { label, kind, phase, planId, stepId, target, representation, postconditions };
}

async function exec({ code, capability, traceId, operation: operationContext }) {
  return runtime.call("figma_exec", {
    code,
    runtimeSdk: "v2",
    maxOutputChars: 30_000,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability,
    traceId,
    attempt: 1,
    operation: operationContext,
  }, 130_000);
}

async function execRaw({ code, capability, traceId, operation: operationContext }) {
  return runtime.callRaw("figma_exec", {
    code,
    runtimeSdk: "v2",
    maxOutputChars: 30_000,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability,
    traceId,
    attempt: 1,
    operation: operationContext,
  }, 130_000);
}

async function fileInventory(stepId, target) {
  return runtime.call("figma_query", {
    kind: "file_inventory",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:${stepId}`,
    attempt: 1,
    operation: operation({
      label: stepId === "baseline" ? "Capture typed live-proof baseline" : "Confirm typed baseline restoration",
      kind: "read",
      phase: "verify",
      stepId,
      target,
      representation: "table",
      postconditions: ["Exact target page child and descendant counts are returned"],
    }),
  });
}

async function probeFixtureByToken(target) {
  return exec({
    code: `
const matches = figma.currentPage.children.filter(function (node) { return node.getPluginData("controlmuxProofId") === ${JSON.stringify(proofId)}; });
if (matches.length > 1) throw new Error("Duplicate live-proof roots during reconciliation");
return matches.length === 1 ? { nodeId: matches[0].id, pageId: figma.currentPage.id } : { nodeId: null, pageId: figma.currentPage.id };
`,
    capability: "figma-verification",
    traceId: `${traceRoot}:reconcile-create`,
    operation: operation({
      label: "Reconcile ambiguous live-proof creation",
      kind: "read",
      phase: "recover",
      stepId: "reconcile-create",
      target,
      representation: "table",
      postconditions: ["Unique proof token is resolved before any retry or cleanup"],
    }),
  });
}

async function removeFixture(nodeId, target) {
  return exec({
    code: `
const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!node) return { removed: true, alreadyAbsent: true, nodeId: ${JSON.stringify(nodeId)} };
if (!node.parent || node.parent.id !== ${JSON.stringify(instance?.pageId)}) throw new Error("Refusing cleanup because the node page does not match");
if (node.name !== ${JSON.stringify(marker)} || node.getPluginData("controlmuxProofId") !== ${JSON.stringify(proofId)}) {
  throw new Error("Refusing to remove a node whose proof identity does not match");
}
node.remove();
const undoCheckpoint = figmaPlugin.commitUndoCheckpoint("full-plugin-upgrade-live-proof-cleanup", { nodeId: ${JSON.stringify(nodeId)}, proofId: ${JSON.stringify(proofId)} });
return { removed: true, alreadyAbsent: false, nodeId: ${JSON.stringify(nodeId)}, undoCheckpoint };
`,
    capability: "figma-native",
    traceId: `${traceRoot}:cleanup`,
    operation: operation({
      label: "Remove exact disposable live-proof fixture",
      kind: "write",
      phase: "recover",
      stepId: "cleanup-fixture",
      target,
      representation: "table",
      postconditions: ["Only the exact proof-id-matched temporary frame is removed"],
    }),
  });
}

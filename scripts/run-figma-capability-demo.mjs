import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RuntimeClient, assert } from "./lib/runtime-client.mjs";

const buildCode = await readFile(resolve("scripts/figma-capability-demo.figma.js"), "utf8");
const runtime = new RuntimeClient({ name: "figma-capability-demo" });
const traceRoot = `capability-demo:${Date.now()}`;
const planId = "figma-capability-demo";

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status);
  const target = `${instance.fileName || "Figma file"} / ${instance.pageName || "Current page"}`;

  const before = await exec({
    code: `return { pageId: figma.currentPage.id, pageName: figma.currentPage.name, childCount: figma.currentPage.children.length, children: figma.currentPage.children.map(function (node) { return { id: node.id, name: node.name, type: node.type }; }) };`,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    traceId: `${traceRoot}:inspect`,
    capability: "figma-native",
    operation: {
      label: "Inspect current page before clearing",
      kind: "read",
      phase: "inspect",
      planId,
      stepId: "inspect-target",
      representation: "tree",
      target,
      postconditions: ["Response identifies exact page and current top-level children"],
    },
  });

  assert(before.pageId === instance.pageId, `Target drift: status page ${instance.pageId}, live page ${before.pageId}.`);
  const cleared = await exec({
    code: `const page = figma.currentPage; const cleared = await figmaPlugin.clearDirectChildren(page); return { pageId: page.id, pageName: page.name, removedCount: cleared.removed.length, removed: cleared.removed, skipped: cleared.skipped, remainingCount: cleared.remainingCount };`,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    traceId: `${traceRoot}:clear`,
    capability: "figma-native",
    operation: {
      label: "Clear current page for capability demonstration",
      kind: "write",
      phase: "execute",
      planId,
      stepId: "prepare-canvas",
      representation: "flow",
      target,
      postconditions: ["Current page has zero top-level children"],
    },
  });
  assert(cleared.remainingCount === 0, `Clear operation left ${cleared.remainingCount} top-level children.`);

  const built = await exec({
    code: buildCode,
    runtimeSdk: "v2",
    maxOutputChars: 30000,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    traceId: `${traceRoot}:build`,
    capability: "figma-design-authoring",
    operation: {
      label: "Build reusable evidence operations dashboard",
      kind: "write",
      phase: "execute",
      planId,
      stepId: "compose-system",
      representation: "rendered-composition",
      target,
      postconditions: [
        "Dashboard frame is 1440 by 1024",
        "Repeated consumers are Figma component instances",
        "Major regions use Auto Layout",
        "Design packet metadata is attached to the root frame"
      ],
    },
  });

  const verificationCode = `
const root = await figma.getNodeByIdAsync(${JSON.stringify(built.rootId)});
const library = await figma.getNodeByIdAsync(${JSON.stringify(built.libraryId)});
if (!root || root.type !== "FRAME") throw new Error("Capability root frame missing");
if (!library || library.type !== "FRAME") throw new Error("Component library frame missing");
const instances = root.findAll(function (node) { return node.type === "INSTANCE"; });
const links = [];
for (const instance of instances) {
  const master = await instance.getMainComponentAsync();
  links.push({ instanceId: instance.id, instanceName: instance.name, masterId: master ? master.id : null, masterName: master ? master.name : null });
}
const autoLayoutNodes = [root].concat(root.findAll(function (node) { return "layoutMode" in node && node.layoutMode !== "NONE"; }));
const components = library.findAll(function (node) { return node.type === "COMPONENT"; });
const componentSets = library.findAll(function (node) { return node.type === "COMPONENT_SET"; });
return {
  root: { id: root.id, name: root.name, width: root.width, height: root.height, topLevelChildren: root.children.map(function (node) { return node.name; }) },
  pageTopLevelCount: figma.currentPage.children.length,
  library: { id: library.id, componentCount: components.length, componentSetCount: componentSets.length },
  instances: { count: instances.length, linkedCount: links.filter(function (item) { return Boolean(item.masterId); }).length, links },
  autoLayoutNodeCount: autoLayoutNodes.length,
  designPacket: JSON.parse(root.getPluginData("designPacket") || "{}"),
  componentMasterIds: JSON.parse(root.getPluginData("componentMasterIds") || "{}"),
  styleIds: JSON.parse(root.getPluginData("styleIds") || "{}")
};`;
  const proof = await exec({
    code: verificationCode,
    runtimeSdk: "v2",
    maxOutputChars: 60000,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    traceId: `${traceRoot}:verify`,
    capability: "figma-verification",
    operation: {
      label: "Verify dashboard structure and component reuse",
      kind: "read",
      phase: "verify",
      planId,
      stepId: "verify-structure",
      representation: "table",
      target,
      postconditions: [
        "All discovered instances resolve to a main component",
        "Component library contains masters and a variant set",
        "Root frame retains code handoff metadata"
      ],
    },
  });
  assert(proof.root.width === 1440 && proof.root.height === 1024, "Unexpected dashboard dimensions.");
  assert(proof.instances.count >= 10 && proof.instances.linkedCount === proof.instances.count, "Component reuse proof is incomplete.");
  assert(proof.autoLayoutNodeCount >= 20, "Auto Layout ownership proof is weaker than expected.");
  assert(built.displayedEvidence.componentLinks === `${proof.instances.linkedCount}/${proof.instances.count}`, "Displayed component evidence drifted from verification.");
  assert(Number(built.displayedEvidence.autoLayout) === proof.autoLayoutNodeCount, "Displayed Auto Layout evidence drifted from verification.");

  const exportResult = await callRaw("figma_export", {
    nodeId: built.rootId,
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
    contentsOnly: true,
    colorProfile: "SRGB",
    maxBytes: 32 * 1024 * 1024,
    filename: "figma-capability-demo",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:export`,
    attempt: 1,
    operation: {
      label: "Export native Figma capability evidence",
      kind: "export",
      phase: "verify",
      planId,
      stepId: "export-evidence",
      representation: "artifact",
      target: "Capability Demo / Operations Dashboard",
      postconditions: ["Persisted PNG comes from the exact verified root frame"],
    },
  });
  assert(exportResult.isError !== true, `figma_export failed: ${JSON.stringify(textPayload(exportResult))}`);
  const artifact = exportResult.structuredContent?.artifact || {};
  assert(typeof artifact.path === "string" && artifact.path.length > 0, "Export returned no local artifact path.");

  process.stdout.write(`${JSON.stringify({
    target: { instanceId: instance.instanceId, fileName: instance.fileName, pageId: instance.pageId, pageName: instance.pageName },
    before,
    cleared,
    built,
    proof,
    artifact,
  })}\n`);
} finally {
  await runtime.close();
}

async function exec(arguments_) {
  return call("figma_exec", { attempt: 1, ...arguments_ });
}

async function call(name, arguments_) {
  return runtime.call(name, arguments_, name === "figma_export" ? 330_000 : 130_000);
}

async function callRaw(name, arguments_) {
  return runtime.callRaw(name, arguments_, name === "figma_export" ? 330_000 : 130_000);
}

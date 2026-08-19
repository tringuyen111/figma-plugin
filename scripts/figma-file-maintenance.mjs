import { RuntimeClient, assert, readOption } from "./lib/runtime-client.mjs";

const clearRequested = process.argv.includes("--clear");
const requestedInstanceId = readOption("--instance-id");
const mode = clearRequested ? "clear" : "inventory";
const traceRoot = `figma-file-${mode}:${Date.now()}`;
const planId = "figma-file-maintenance";

const runtime = new RuntimeClient({ name: "figma-file-maintenance" });

async function main() {
  try {
    await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status, requestedInstanceId);
  assert(Array.isArray(instance.runtimeSdks) && instance.runtimeSdks.includes("v2"), "The selected companion does not advertise Runtime SDK v2.");

  const target = `${instance.fileName || "Figma file"} / all pages`;
  const result = await runtime.call("figma_exec", {
    code: clearRequested ? CLEAR_CODE : INVENTORY_CODE,
    runtimeSdk: "v2",
    maxOutputChars: 70000,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    traceId: `${traceRoot}:${mode}`,
    attempt: 1,
    capability: "figma-native",
    operation: {
      label: clearRequested ? "Clear file-owned Figma assets" : "Inventory file-owned Figma assets",
      kind: clearRequested ? "write" : "read",
      phase: clearRequested ? "execute" : "inspect",
      planId,
      stepId: clearRequested ? "clear-owned-assets" : "inventory-owned-assets",
      representation: "table",
      target,
      postconditions: clearRequested
        ? ["Every page has zero direct children", "Local styles and variable collections are removed"]
        : ["Every page and file-owned reusable asset type is counted"],
    },
  });

  if (clearRequested) {
    const remainingPageChildren = result.after.pages.reduce((sum, page) => sum + page.childCount, 0);
    const remainingStyles = Object.values(result.after.localStyles).reduce((sum, count) => sum + count, 0);
    assert(remainingPageChildren === 0, `Clear left ${remainingPageChildren} direct page children.`);
    assert(result.after.components.total === 0, `Clear left ${result.after.components.total} component-related nodes.`);
    assert(remainingStyles === 0, `Clear left ${remainingStyles} local styles.`);
    assert(result.after.variables.collections === 0 && result.after.variables.variables === 0, "Clear left local variables or collections.");
  }

  process.stdout.write(`${JSON.stringify({
    mode,
    target: {
      instanceId: instance.instanceId,
      fileName: instance.fileName,
      currentPageId: instance.pageId,
      currentPageName: instance.pageName,
    },
    result,
  })}\n`);
  } finally {
    await runtime.close();
  }
}

const INVENTORY_CODE = String.raw`
const pages = figma.root.children.filter(function (node) { return node.type === "PAGE"; });
for (const page of pages) await figmaPlugin.loadPage(page);
const pageSummaries = pages.map(function (page) {
  const reusable = page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET", "INSTANCE"] });
  return {
    id: page.id,
    name: page.name,
    childCount: page.children.length,
    descendantCount: page.findAll(function () { return true; }).length,
    components: reusable.filter(function (node) { return node.type === "COMPONENT"; }).length,
    componentSets: reusable.filter(function (node) { return node.type === "COMPONENT_SET"; }).length,
    instances: reusable.filter(function (node) { return node.type === "INSTANCE"; }).length,
    topLevel: page.children.slice(0, 100).map(function (node) { return { id: node.id, name: node.name, type: node.type }; })
  };
});
const paints = await figma.getLocalPaintStylesAsync();
const texts = await figma.getLocalTextStylesAsync();
const effects = await figma.getLocalEffectStylesAsync();
const grids = await figma.getLocalGridStylesAsync();
const collections = figma.variables ? await figma.variables.getLocalVariableCollectionsAsync() : [];
const variables = figma.variables ? await figma.variables.getLocalVariablesAsync() : [];
let enabledLibraryVariableCollections = null;
let teamLibraryError = null;
try {
  enabledLibraryVariableCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
} catch (error) {
  teamLibraryError = error instanceof Error ? error.message : String(error);
}
return {
  editorType: figma.editorType,
  fileName: figma.root.name,
  pages: pageSummaries,
  components: {
    total: pageSummaries.reduce(function (sum, page) { return sum + page.components + page.componentSets + page.instances; }, 0),
    components: pageSummaries.reduce(function (sum, page) { return sum + page.components; }, 0),
    componentSets: pageSummaries.reduce(function (sum, page) { return sum + page.componentSets; }, 0),
    instances: pageSummaries.reduce(function (sum, page) { return sum + page.instances; }, 0)
  },
  localStyles: { paint: paints.length, text: texts.length, effect: effects.length, grid: grids.length },
  variables: {
    collections: collections.length,
    variables: variables.length,
    names: collections.slice(0, 100).map(function (collection) { return collection.name; })
  },
  enabledLibraries: {
    variableCollections: enabledLibraryVariableCollections ? enabledLibraryVariableCollections.length : null,
    error: teamLibraryError
  }
};`;

const CLEAR_CODE = String.raw`
async function snapshot() {
  const pages = figma.root.children.filter(function (node) { return node.type === "PAGE"; });
  for (const page of pages) await figmaPlugin.loadPage(page);
  const pageSummaries = pages.map(function (page) {
    const reusable = page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET", "INSTANCE"] });
    return {
      id: page.id,
      name: page.name,
      childCount: page.children.length,
      components: reusable.filter(function (node) { return node.type === "COMPONENT"; }).length,
      componentSets: reusable.filter(function (node) { return node.type === "COMPONENT_SET"; }).length,
      instances: reusable.filter(function (node) { return node.type === "INSTANCE"; }).length
    };
  });
  const paints = await figma.getLocalPaintStylesAsync();
  const texts = await figma.getLocalTextStylesAsync();
  const effects = await figma.getLocalEffectStylesAsync();
  const grids = await figma.getLocalGridStylesAsync();
  const collections = figma.variables ? await figma.variables.getLocalVariableCollectionsAsync() : [];
  const variables = figma.variables ? await figma.variables.getLocalVariablesAsync() : [];
  return {
    pages: pageSummaries,
    components: {
      total: pageSummaries.reduce(function (sum, page) { return sum + page.components + page.componentSets + page.instances; }, 0),
      components: pageSummaries.reduce(function (sum, page) { return sum + page.components; }, 0),
      componentSets: pageSummaries.reduce(function (sum, page) { return sum + page.componentSets; }, 0),
      instances: pageSummaries.reduce(function (sum, page) { return sum + page.instances; }, 0)
    },
    localStyles: { paint: paints.length, text: texts.length, effect: effects.length, grid: grids.length },
    variables: { collections: collections.length, variables: variables.length }
  };
}

const before = await snapshot();
const pages = figma.root.children.filter(function (node) { return node.type === "PAGE"; });
const clearedPages = [];
for (const page of pages) {
  const cleared = await figmaPlugin.clearDirectChildren(page);
  clearedPages.push({
    id: page.id,
    name: page.name,
    removedCount: cleared.removed.length,
    skipped: cleared.skipped,
    remainingCount: cleared.remainingCount
  });
}

const styleGroups = [
  { type: "paint", values: await figma.getLocalPaintStylesAsync() },
  { type: "text", values: await figma.getLocalTextStylesAsync() },
  { type: "effect", values: await figma.getLocalEffectStylesAsync() },
  { type: "grid", values: await figma.getLocalGridStylesAsync() }
];
const removedStyles = { paint: 0, text: 0, effect: 0, grid: 0 };
for (const group of styleGroups) {
  for (const style of group.values) {
    style.remove();
    removedStyles[group.type] += 1;
  }
}

const collections = figma.variables ? await figma.variables.getLocalVariableCollectionsAsync() : [];
const removedVariableCollections = collections.map(function (collection) { return { id: collection.id, name: collection.name, variableCount: collection.variableIds.length }; });
for (const collection of collections) collection.remove();

const undoCheckpoint = figmaPlugin.commitUndoCheckpoint("clear-file-owned-assets", {
  pages: clearedPages.length,
  removedTopLevelNodes: clearedPages.reduce(function (sum, page) { return sum + page.removedCount; }, 0),
  removedStyles: removedStyles,
  removedVariableCollections: removedVariableCollections.length
});
const after = await snapshot();
return { before, clearedPages, removedStyles, removedVariableCollections, undoCheckpoint, after };`;

await main();

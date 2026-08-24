import { RuntimeClient, assert } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "runtime-sdk-v2-live-smoke" });
const traceId = `runtime-sdk-v2-live:${Date.now()}`;
const MAX_ATTEMPTS = 2;
const RETRYABLE_PROVIDER_ERROR = /Unable to establish connection to Figma after 10 seconds/i;
const providerProbes = process.argv.includes("--provider-probes");

async function main() {
  try {
    await runtime.connect();
    const status = await runtime.status(true);
    const instance = runtime.resolveSingleInstance(status);
    assert(instance.runtimeSdks.includes("v2"), "Connected companion does not advertise Runtime SDK v2.");
    const baseline = await queryInventory(instance);
    const transientErrors = [];
    let proof;
    let attempts = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      attempts = attempt;
      try {
        proof = await executeProof(instance, attempt);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        transientErrors.push({ attempt, message });
        if (!RETRYABLE_PROVIDER_ERROR.test(message) || attempt === MAX_ATTEMPTS) throw error;
        const afterFailure = await queryInventory(instance);
        assertCleanInventory(baseline, afterFailure);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    assert(proof, "Runtime SDK v2 proof returned no result.");

    assert(proof.runtimeSdk === "v2", "Live execution did not use Runtime SDK v2.");
    assert(proof.styleBinding?.slot === "fill" && proof.styleBinding?.styleId === proof.styleId, "Async fill style binding did not retain exact slot and style identity.");
    assert(proof.variableBinding?.variableId === proof.widthVariableId, "Node variable binding did not retain exact Variable identity.");
    assert(proof.paintBinding?.variableId === proof.colorVariableId, "Paint variable binding did not retain exact Variable identity.");
    assert(proof.handoff?.component?.id === proof.componentId, "Handoff component identity drifted.");
    assert(Array.isArray(proof.handoff?.devResources), "Dev Resource inspection did not return an array.");
    if (providerProbes) {
      assert(proof.handoff?.component?.publishStatus === "UNPUBLISHED", "Unexpected local component publish status.");
      assert(["PASS", "BLOCKED_BY_PROVIDER"].includes(proof.devResourceWrite?.status), "Dev Resource write returned no truthful capability state.");
      if (proof.devResourceWrite.status === "PASS") assert(proof.handoff.devResources.length === 1, "Successful Dev Resource write was not visible to inspection.");
    } else {
      assert(proof.handoff?.component?.publishStatus === null, "Core smoke unexpectedly queried provider publish status.");
      assert(proof.handoff.devResources.length === 0 && proof.devResourceWrite?.status === "SKIPPED", "Core smoke unexpectedly queried or wrote Dev Resources.");
    }
    assert(proof.after?.pageChildCount === proof.before?.pageChildCount, "Temporary page nodes were not fully removed.");
    assert(proof.after?.localStyleCount === proof.before?.localStyleCount, "Temporary local style was not removed.");
    assert(proof.after?.variableCollectionCount === proof.before?.variableCollectionCount, "Temporary variable collection was not removed.");

    const after = await runtime.status(true);
    const afterInstance = after.instances?.find((candidate) => candidate.instanceId === instance.instanceId);
    assert(after.queueLength === 0 && after.pendingCount === 0 && afterInstance?.queueLength === 0 && afterInstance?.inFlight === 0, "Runtime queue did not return to idle after live v2 smoke.");

    process.stdout.write(`${JSON.stringify({
      target: { instanceId: instance.instanceId, fileName: instance.fileName, pageId: instance.pageId, pageName: instance.pageName },
      providerProbes,
      attempts,
      transientErrors,
      proof,
      finalState: { queueLength: after.queueLength, pendingCount: after.pendingCount, instanceQueueLength: afterInstance.queueLength, instanceInFlight: afterInstance.inFlight },
      verdict: providerProbes && proof.devResourceWrite.status !== "PASS" ? "PASS_WITH_PROVIDER_LIMIT" : "PASS",
    })}\n`);
  } finally {
    await runtime.close();
  }
}

async function executeProof(instance, attempt) {
  return runtime.call("figma_exec", {
    code: LIVE_CODE.replace("__PROVIDER_PROBES__", providerProbes ? "true" : "false"),
    runtimeSdk: "v2",
    maxOutputChars: 30000,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-native",
    traceId,
    attempt,
    operation: {
      label: "Prove Runtime SDK v2 native helpers",
      kind: "write",
      phase: "verify",
      planId: "runtime-sdk-v2-upgrade",
      stepId: "live-helper-smoke",
      representation: "table",
      target: `${instance.fileName} / ${instance.pageName}`,
      postconditions: [
        "Targeted page loading succeeds",
        "Style and variable bindings use native async/object APIs",
        "Handoff preserves component identity without optional provider probes",
        "Temporary fixture and local assets are removed",
      ],
    },
  });
}

async function queryInventory(instance) {
  return runtime.call("figma_query", { kind: "file_inventory", instanceId: instance.instanceId });
}

function assertCleanInventory(expected, actual) {
  assert(inventoryFingerprint(actual) === inventoryFingerprint(expected), "Retry blocked: failed v2 attempt changed file-owned nodes/styles/variables.");
}

function inventoryFingerprint(value) {
  return JSON.stringify({
    pages: (value.pages || []).map((page) => ({ id: page.id, childCount: page.childCount })),
    localStyles: value.localStyles,
    variables: { collections: value.variables?.collections, variables: value.variables?.variables },
  });
}

const LIVE_CODE = String.raw`
const providerProbes = __PROVIDER_PROBES__;
const page = await figmaPlugin.loadPage(figma.currentPage);
const before = {
  pageChildCount: page.children.length,
  localStyleCount: (await figma.getLocalPaintStylesAsync()).length,
  variableCollectionCount: (await figma.variables.getLocalVariableCollectionsAsync()).length
};
let fixture = null;
let paintStyle = null;
let variableCollection = null;
let evidence = null;
try {
  fixture = figma.createFrame();
  fixture.name = "Runtime SDK v2 / Temporary Fixture";
  fixture.resize(320, 160);
  const component = figma.createComponent();
  component.name = "Runtime SDK v2 / Component";
  component.resize(160, 80);
  fixture.appendChild(component);
  const rectangle = figma.createRectangle();
  rectangle.name = "Runtime SDK v2 / Bound Rectangle";
  rectangle.resize(120, 48);
  component.appendChild(rectangle);

  paintStyle = figma.createPaintStyle();
  paintStyle.name = "Runtime SDK v2 / Temporary Paint";
  paintStyle.paints = [{ type: "SOLID", color: { r: 0.12, g: 0.22, b: 0.38 } }];
  const styleBinding = await figmaPlugin.bindStyle(rectangle, "fill", paintStyle.id);

  variableCollection = figma.variables.createVariableCollection("Runtime SDK v2 / Temporary Variables");
  const widthVariable = figma.variables.createVariable("width", variableCollection, "FLOAT");
  widthVariable.setValueForMode(variableCollection.defaultModeId, 120);
  const colorVariable = figma.variables.createVariable("color", variableCollection, "COLOR");
  colorVariable.setValueForMode(variableCollection.defaultModeId, { r: 0.12, g: 0.22, b: 0.38, a: 1 });
  const variableBinding = await figmaPlugin.bindVariable(rectangle, "width", widthVariable);
  const reboundPaint = await figmaPlugin.bindPaintVariable({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", colorVariable);
  const paintBinding = reboundPaint.boundVariables && reboundPaint.boundVariables.color
    ? { variableId: reboundPaint.boundVariables.color.id, type: reboundPaint.boundVariables.color.type }
    : null;

  let devResourceWrite = { status: "SKIPPED", error: null };
  if (providerProbes) {
    devResourceWrite = { status: "PASS", error: null };
    try {
      await component.addDevResourceAsync("https://example.com/runtime-sdk-v2", "Runtime SDK v2 source");
    } catch (error) {
      devResourceWrite = { status: "BLOCKED_BY_PROVIDER", error: error instanceof Error ? error.message : String(error) };
    }
  }
  const handoff = await figmaPlugin.inspectHandoff(component, { css: false, includeChildren: true, devResources: providerProbes, publishStatus: providerProbes });
  evidence = {
    runtimeSdk: figmaPlugin.version,
    before,
    componentId: component.id,
    styleId: paintStyle.id,
    widthVariableId: widthVariable.id,
    colorVariableId: colorVariable.id,
    styleBinding,
    variableBinding,
    paintBinding,
    devResourceWrite,
    handoff
  };
} finally {
  if (fixture && fixture.parent) fixture.remove();
  if (paintStyle) paintStyle.remove();
  if (variableCollection) variableCollection.remove();
}
const undoCheckpoint = figmaPlugin.commitUndoCheckpoint("runtime-sdk-v2-live-cleanup", { temporaryFixtureRemoved: true });
const after = {
  pageChildCount: page.children.length,
  localStyleCount: (await figma.getLocalPaintStylesAsync()).length,
  variableCollectionCount: (await figma.variables.getLocalVariableCollectionsAsync()).length
};
return Object.assign({}, evidence, { undoCheckpoint, after });`;

await main();

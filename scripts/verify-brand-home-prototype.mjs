import { RuntimeClient, assert } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-home-prototype-readback" });
const traceRoot = `tri-brand-home-prototype-readback:${Date.now()}`;

const code = String.raw`
await figma.currentPage.loadAsync();
const page = figma.currentPage;
const canvas = page.findOne((node) => node.type === "FRAME" && node.name === "Personal Homepage / Paper / 1440x1024");
const source = canvas?.findOne((node) => node.name === "Hero / Primary CTA");
const destination = page.findOne((node) => node.type === "FRAME" && node.name === "Selected Work / Prototype Destination / 1440x1024");
const recovery = destination?.findOne((node) => node.name === "Prototype Destination / Back Button");
if (!canvas || !source || !destination || !recovery) throw new Error("Bounded prototype path is incomplete.");

function projection(node) {
  return {
    id: node.id,
    name: node.name,
    reactions: node.reactions.map((reaction) => ({
      trigger: reaction.trigger,
      actions: (reaction.actions ?? (reaction.action ? [reaction.action] : [])).map((action) => ({
        type: action.type,
        destinationId: "destinationId" in action ? action.destinationId : null,
        navigation: "navigation" in action ? action.navigation : null,
      })),
    })),
  };
}

const sourceProjection = projection(source);
const recoveryProjection = projection(recovery);
const sourceAction = sourceProjection.reactions[0]?.actions[0];
const recoveryAction = recoveryProjection.reactions[0]?.actions[0];
if (sourceProjection.reactions[0]?.trigger?.type !== "ON_CLICK") throw new Error("Primary CTA is missing ON_CLICK trigger.");
if (sourceAction?.type !== "NODE" || sourceAction.destinationId !== destination.id || sourceAction.navigation !== "NAVIGATE") throw new Error("Primary CTA navigation readback is invalid.");
if (recoveryProjection.reactions[0]?.trigger?.type !== "ON_CLICK" || recoveryAction?.type !== "BACK") throw new Error("Back recovery readback is invalid.");

return {
  state: "PASS_BOUNDED_TO_FIGMA_REACTION_READBACK",
  page: { id: page.id, name: page.name },
  source: sourceProjection,
  destination: { id: destination.id, name: destination.name, width: destination.width, height: destination.height },
  recovery: recoveryProjection,
  statePath: {
    source: source.id,
    trigger: "ON_CLICK",
    action: "NAVIGATE",
    destination: destination.id,
    recovery: "BACK",
  },
  limitations: ["Figma click-run was not executed in a cloud prototype player; this is native reaction wiring and readback evidence."]
};
`;

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status);
  const result = await runtime.call("figma_exec", {
    code,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-prototype",
    traceId: `${traceRoot}:readback`,
    attempt: 1,
    operation: {
      label: "Read back Personal Homepage prototype path",
      kind: "read",
      phase: "verify",
      planId: "tri-brand-home-prototype",
      stepId: "reaction-readback",
      representation: "state-diagram",
      target: `${instance.fileName} / ${instance.pageName}`,
      postconditions: [
        "ON_CLICK navigation points to the exact destination frame",
        "BACK recovery reaction is present on the destination",
      ],
    },
  }, 180_000);
  assert(result?.state === "PASS_BOUNDED_TO_FIGMA_REACTION_READBACK", `Unexpected prototype readback: ${JSON.stringify(result)}`);
  process.stdout.write(`${JSON.stringify({ bundleRevision: instance.bundleRevision, result }, null, 2)}\n`);
} finally {
  await runtime.close();
}

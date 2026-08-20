import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-component-refine" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const code = String.raw`
await figma.currentPage.loadAsync();
const componentsPage = figma.root.children.find((node) => node.type === "PAGE" && node.name === "02 - Components");
if (!componentsPage) throw new Error("02 - Components page not found.");
await figma.setCurrentPageAsync(componentsPage);
const collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((item) => item.name === "Tri Brand / Paper");
if (!collection) throw new Error("Tri Brand / Paper collection not found.");
const variables = await figma.variables.getLocalVariablesAsync();
const muted = variables.find((item) => item.variableCollectionId === collection.id && item.name === "color/muted");
if (!muted) throw new Error("color/muted variable not found.");
const component = componentsPage.findOne((node) => node.type === "COMPONENT" && node.name === "Work Card / Default");
if (!component) throw new Error("Work Card / Default not found.");
const mutatedNodeIds = [];
for (const name of ["Card Description", "Card Type"]) {
  const node = component.findOne((item) => item.type === "TEXT" && item.name === name);
  if (!node) throw new Error(name + " not found.");
  const paints = node.fills.map((paint) => paint.type === "SOLID" ? figma.variables.setBoundVariableForPaint({ ...paint }, "color", muted) : paint);
  node.fills = paints;
  mutatedNodeIds.push(node.id);
}
return { state: "PASS_MUTED_TOKEN_REFINED", componentId: component.id, mutedVariableId: muted.id, mutatedNodeIds };
`;

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = status.instances.find((item) => item.instanceId === instanceId);
  if (!instance) throw new Error("Cloud library instance not found.");
  const result = await runtime.call("figma_exec", {
    code,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: "1:9",
    capability: "figma-design-system",
    traceId: `tri-brand-cloud-library-component-refine:${Date.now()}`,
    attempt: 1,
    operation: {
      label: "Refine Work Card muted text token binding",
      kind: "write",
      phase: "execute",
      planId: "tri-brand-cross-file-library",
      stepId: "P3.b-refine",
      representation: "component-specimen",
      target: `${instance.fileName} / 02 - Components / Work Card / Default`,
      postconditions: ["Description and type use color/muted", "No hardcoded muted text remains in the component binding"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ result }, null, 2)}\n`);
} finally {
  await runtime.close();
}

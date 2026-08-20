import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-structure" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const traceRoot = `tri-brand-cloud-library-structure:${Date.now()}`;

const code = String.raw`
const pageList = figma.root.children.filter((node) => node.type === "PAGE");
const foundations = pageList.find((page) => page.name === "01 - Foundations") ?? pageList.find((page) => page.id === figma.currentPage.id);
if (!foundations) throw new Error("No page available for foundations.");
foundations.name = "01 - Foundations";
const componentsPage = pageList.find((page) => page.name === "02 - Components") ?? figma.createPage();
componentsPage.name = "02 - Components";

await figma.setCurrentPageAsync(foundations);
await foundations.loadAsync();
const createdNodeIds = [];
let specimen = foundations.findOne((node) => node.type === "FRAME" && node.name === "Tri Brand / Paper / Token Specimen");
if (!specimen) {
  specimen = figma.createFrame();
  specimen.name = "Tri Brand / Paper / Token Specimen";
  specimen.resize(920, 360);
  specimen.x = 72;
  specimen.y = 72;
  specimen.fills = [{ type: "SOLID", color: { r: 0.965, g: 0.945, b: 0.910 } }];
  specimen.strokes = [{ type: "SOLID", color: { r: 0.847, g: 0.812, b: 0.757 } }];
  specimen.strokeWeight = 1;
  foundations.appendChild(specimen);
  createdNodeIds.push(specimen.id);
  const swatches = [
    ["Surface", { r: 0.965, g: 0.945, b: 0.910 }],
    ["Panel", { r: 1.000, g: 0.992, b: 0.973 }],
    ["Ink", { r: 0.090, g: 0.082, b: 0.071 }],
    ["Ember", { r: 0.902, g: 0.310, b: 0.180 }],
    ["Forest", { r: 0.184, g: 0.388, b: 0.322 }]
  ];
  for (let index = 0; index < swatches.length; index += 1) {
    const [name, color] = swatches[index];
    const rect = figma.createRectangle();
    rect.name = "Token / " + name;
    rect.resize(140, 140);
    rect.x = 40 + index * 168;
    rect.y = 92;
    rect.fills = [{ type: "SOLID", color }];
    rect.cornerRadius = 2;
    specimen.appendChild(rect);
    createdNodeIds.push(rect.id);
  }
}

return {
  state: "PASS_STRUCTURE_CREATED",
  pages: figma.root.children.filter((node) => node.type === "PAGE").map((page) => ({ id: page.id, name: page.name, childCount: page.children.length })),
  foundations: { id: foundations.id, name: foundations.name, specimenId: specimen.id },
  components: { id: componentsPage.id, name: componentsPage.name },
  createdNodeIds
};
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
    pageId: instance.pageId,
    capability: "figma-design-system",
    traceId: `${traceRoot}:structure`,
    attempt: 1,
    operation: {
      label: "Create cloud library page structure",
      kind: "write",
      phase: "execute",
      planId: "tri-brand-cross-file-library",
      stepId: "P2.a",
      representation: "tree",
      target: `${instance.fileName} / ${instance.pageName}`,
      postconditions: ["Foundations and Components pages exist", "Paper token specimen exists"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ instance: { instanceId: instance.instanceId, fileName: instance.fileName }, result }, null, 2)}\n`);
} finally {
  await runtime.close();
}

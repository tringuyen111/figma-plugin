import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-home-prototype" });
const traceRoot = `tri-brand-home-prototype:${Date.now()}`;

function operation(label, kind, phase, stepId, target, postconditions) {
  return {
    label,
    kind,
    phase,
    planId: "tri-brand-home-prototype",
    stepId,
    representation: "state-diagram",
    target,
    postconditions,
  };
}

const code = String.raw`
const COLORS = {
  surface: { r: 0.965, g: 0.945, b: 0.910 },
  panel: { r: 1.0, g: 0.992, b: 0.973 },
  ink: { r: 0.090, g: 0.082, b: 0.071 },
  muted: { r: 0.408, g: 0.380, b: 0.345 },
  line: { r: 0.847, g: 0.812, b: 0.757 },
  forest: { r: 0.184, g: 0.388, b: 0.322 }
};
const paint = (color, opacity = 1) => [{ type: "SOLID", color, opacity }];
const font = (family, style = "Regular") => ({ family, style });
const loaded = new Set();

async function ensureFont(family, style = "Regular") {
  const key = family + "/" + style;
  if (!loaded.has(key)) {
    await figma.loadFontAsync(font(family, style));
    loaded.add(key);
  }
}

async function addText(parent, name, characters, x, y, width, size, color, family, style = "Regular") {
  await ensureFont(family, style);
  const node = figma.createText();
  node.name = name;
  node.fontName = font(family, style);
  node.fontSize = size;
  node.characters = characters;
  node.textAutoResize = "HEIGHT";
  node.resize(width, Math.max(size * 1.25, 20));
  node.fills = paint(color);
  node.x = x;
  node.y = y;
  parent.appendChild(node);
  return node;
}

function addRect(parent, name, x, y, width, height, color, radius = 0, stroke = null) {
  const node = figma.createRectangle();
  node.name = name;
  node.resize(width, height);
  node.x = x;
  node.y = y;
  node.fills = paint(color);
  if (radius) node.cornerRadius = radius;
  if (stroke) {
    node.strokes = paint(stroke);
    node.strokeWeight = 1;
  }
  parent.appendChild(node);
  return node;
}

function reactionSummary(node) {
  return {
    id: node.id,
    name: node.name,
    reactions: node.reactions.map((reaction, reactionIndex) => ({
      reactionIndex,
      trigger: reaction.trigger,
      actions: (reaction.actions ?? (reaction.action ? [reaction.action] : [])).map((action, actionIndex) => ({
        actionIndex,
        type: action.type,
        destinationId: "destinationId" in action ? action.destinationId : null,
        navigation: "navigation" in action ? action.navigation : null,
      })),
    })),
  };
}

await figma.currentPage.loadAsync();
const page = figma.currentPage;
const canvas = page.findOne((node) => node.type === "FRAME" && node.name === "Personal Homepage / Paper / 1440x1024");
if (!canvas) throw new Error("Personal Homepage frame was not found on the bound page.");
const source = canvas.findOne((node) => node.name === "Hero / Primary CTA");
if (!source) throw new Error("Hero / Primary CTA was not found inside the Personal Homepage frame.");

let destination = page.findOne((node) => node.type === "FRAME" && node.name === "Selected Work / Prototype Destination / 1440x1024");
const createdNodeIds = [];
const mutatedNodeIds = [source.id];

if (!destination) {
  destination = figma.createFrame();
  destination.name = "Selected Work / Prototype Destination / 1440x1024";
  destination.resize(1440, 1024);
  destination.x = Math.max(1600, ...page.children.map((node) => node.x + node.width + 160));
  destination.y = 0;
  destination.fills = paint(COLORS.surface);
  destination.strokes = [];
  destination.clipsContent = false;
  page.appendChild(destination);
  createdNodeIds.push(destination.id);

  const rule = addRect(destination, "Prototype Destination / Rule", 84, 84, 1272, 1, COLORS.line);
  const eyebrow = await addText(destination, "Prototype Destination / Eyebrow", "SELECTED WORK  /  PROTOTYPE STATE", 84, 128, 420, 10, COLORS.forest, "IBM Plex Mono", "Bold");
  const title = await addText(destination, "Prototype Destination / Title", "Selected work,\nmade visible.", 84, 186, 720, 72, COLORS.ink, "Georgia");
  const body = await addText(destination, "Prototype Destination / Body", "This frame is the destination of the primary hero CTA. The path is intentionally bounded to navigation plus a recoverable back action.", 84, 390, 520, 18, COLORS.muted, "Arial");
  const back = addRect(destination, "Prototype Destination / Back Button", 84, 520, 168, 48, COLORS.ink, 24);
  const backLabel = await addText(destination, "Prototype Destination / Back Label", "← BACK TO HOME", 108, 538, 130, 10, COLORS.surface, "IBM Plex Mono", "Bold");
  const card = addRect(destination, "Prototype Destination / Work Card", 820, 180, 420, 300, COLORS.panel, 2, COLORS.line);
  const cardAccent = addRect(destination, "Prototype Destination / Card Accent", 860, 224, 80, 4, COLORS.forest, 2);
  const cardTitle = await addText(destination, "Prototype Destination / Card Title", "ControlMux", 860, 270, 280, 32, COLORS.ink, "Georgia");
  const cardCopy = await addText(destination, "Prototype Destination / Card Copy", "A local control plane for useful agent work.", 860, 340, 300, 15, COLORS.muted, "Arial");
  createdNodeIds.push(rule.id, eyebrow.id, title.id, body.id, back.id, backLabel.id, card.id, cardAccent.id, cardTitle.id, cardCopy.id);

  await back.setReactionsAsync([
    { trigger: { type: "ON_CLICK" }, actions: [{ type: "BACK" }] }
  ]);
  mutatedNodeIds.push(back.id);
}

await source.setReactionsAsync([
  {
    trigger: { type: "ON_CLICK" },
    actions: [{
      type: "NODE",
      destinationId: destination.id,
      navigation: "NAVIGATE",
      transition: { type: "DISSOLVE", easing: { type: "EASE_IN_AND_OUT" }, duration: 0.2 },
      resetScrollPosition: true,
      resetInteractiveComponents: true,
    }]
  }
]);

return {
  page: { id: page.id, name: page.name },
  source: reactionSummary(source),
  destination: { id: destination.id, name: destination.name, width: destination.width, height: destination.height },
  recovery: reactionSummary(destination.findOne((node) => node.name === "Prototype Destination / Back Button")),
  createdNodeIds,
  mutatedNodeIds,
  statePath: {
    source: source.id,
    trigger: "ON_CLICK",
    action: "NAVIGATE",
    destination: destination.id,
    recovery: "BACK"
  }
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
    traceId: `${traceRoot}:wire-reactions`,
    attempt: 1,
    operation: operation(
      "Wire Personal Homepage bounded prototype path",
      "write",
      "execute",
      "wire-reactions",
      `${instance.fileName} / ${instance.pageName}`,
      [
        "Hero CTA has an explicit ON_CLICK navigation reaction",
        "Destination state has an explicit BACK recovery reaction",
        "Exact source and destination ids are returned for readback"
      ],
    ),
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ bundleRevision: instance.bundleRevision, result }, null, 2)}\n`);
} finally {
  await runtime.close();
}

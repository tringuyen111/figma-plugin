import { RuntimeClient, assert } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-home-design" });
const traceRoot = `tri-brand-home-design:${Date.now()}`;

function operation(label, kind, phase, stepId, target, postconditions) {
  return {
    label,
    kind,
    phase,
    planId: "tri-brand-home-design-to-code",
    stepId,
    representation: "component-specimen",
    target,
    postconditions,
  };
}

function request(instance, code, stepId, label, kind = "write", phase = "execute", timeout = 180_000) {
  return runtime.call("figma_exec", {
    code,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-design-authoring",
    traceId: `${traceRoot}:${stepId}`,
    attempt: 1,
    operation: operation(label, kind, phase, stepId, `${instance.fileName} / ${instance.pageName}`, [
      "Target page remains explicitly bound",
      "Returned node ids and measured counts remain inspectable",
    ]),
  }, timeout);
}

const inspectCode = String.raw`
const pages = figma.root.children.map((page) => ({ id: page.id, name: page.name }));
await figma.currentPage.loadAsync();
const currentPage = {
  id: figma.currentPage.id,
  name: figma.currentPage.name,
  childCount: figma.currentPage.children.length,
  topLevel: figma.currentPage.children.slice(0, 12).map((node) => ({ id: node.id, name: node.name, type: node.type }))
};
const availableFonts = (await figma.listAvailableFontsAsync()).map((entry) => entry.fontName);
const fonts = availableFonts.filter((font) => /Inter|Georgia|Baskerville|Iowan|Avenir|Helvetica|Roboto|Mono|Arial|Atkinson/i.test(font.family));
const families = [...new Set(availableFonts.map((font) => font.family))]
  .filter((family) => /Inter|Georgia|Baskerville|Iowan|Avenir|Helvetica|Roboto|Mono|Arial|Atkinson/i.test(family))
  .sort();
const components = figma.currentPage.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] })
  .map((node) => ({ page: figma.currentPage.name, id: node.id, name: node.name, type: node.type }));
return { fileKey: figma.fileKey ?? null, pages, currentPage, families, fonts: fonts.slice(0, 160), components: components.slice(0, 80) };
`;

const createCode = String.raw`
const COLORS = {
  surface: { r: 0.965, g: 0.945, b: 0.910 },
  panel: { r: 1.0, g: 0.992, b: 0.973 },
  panelStrong: { r: 0.933, g: 0.898, b: 0.847 },
  ink: { r: 0.090, g: 0.082, b: 0.071 },
  muted: { r: 0.408, g: 0.380, b: 0.345 },
  line: { r: 0.847, g: 0.812, b: 0.757 },
  lineStrong: { r: 0.569, g: 0.545, b: 0.506 },
  accent: { r: 0.902, g: 0.310, b: 0.180 },
  forest: { r: 0.184, g: 0.388, b: 0.322 },
  white: { r: 1, g: 1, b: 1 }
};
const paint = (color, opacity = 1) => [{ type: "SOLID", color, opacity }];
const solidStyle = (style, color) => { style.paints = paint(color); return style; };
const setFills = (node, color, opacity = 1) => { node.fills = paint(color, opacity); };
const setStroke = (node, color, weight = 1) => { node.strokes = paint(color); node.strokeWeight = weight; };
const font = (family = "Arial", style = "Regular") => ({ family, style });
const loaded = new Set();
async function ensureFont(family = "Arial", style = "Regular") {
  const key = family + "/" + style;
  if (!loaded.has(key)) { await figma.loadFontAsync(font(family, style)); loaded.add(key); }
}
async function addText(parent, name, characters, x, y, width, size, color, style = "Regular", lineHeight = 1.2, letterSpacing = 0, family = "Arial") {
  await ensureFont(family, style);
  const node = figma.createText();
  node.name = name;
  node.fontName = font(family, style);
  node.fontSize = size;
  node.characters = characters;
  node.textAutoResize = "HEIGHT";
  node.resize(width, Math.max(size * lineHeight, 20));
  node.lineHeight = { unit: "PIXELS", value: size * lineHeight };
  node.letterSpacing = { unit: "PIXELS", value: letterSpacing };
  node.fills = paint(color);
  node.x = x;
  node.y = y;
  parent.appendChild(node);
  return node;
}
function addRect(parent, name, x, y, width, height, color, radius = 0, stroke = null, strokeWeight = 1) {
  const node = figma.createRectangle();
  node.name = name;
  node.resize(width, height);
  node.x = x;
  node.y = y;
  setFills(node, color);
  if (radius) node.cornerRadius = radius;
  if (stroke) setStroke(node, stroke, strokeWeight);
  parent.appendChild(node);
  return node;
}
function addFrame(parent, name, x, y, width, height, color, radius = 0, stroke = null) {
  const node = figma.createFrame();
  node.name = name;
  node.resize(width, height);
  node.x = x;
  node.y = y;
  setFills(node, color);
  if (radius) node.cornerRadius = radius;
  if (stroke) setStroke(node, stroke, 1);
  parent.appendChild(node);
  return node;
}
function addLine(parent, name, x, y, width, color, weight = 1) {
  return addRect(parent, name, x, y, width, weight, color);
}
function addMark(parent, x, y, size) {
  const svg = '<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill="#171512" d="M45 94 C74 73 107 65 142 66 C169 67 193 69 212 59 C204 75 189 84 165 85 C124 82 84 86 45 94 Z"/>' +
    '<path fill="#171512" d="M141 80 C133 102 121 126 108 148 C98 165 93 178 97 189 C102 202 117 206 132 199 C148 191 158 171 168 152 C180 132 194 123 213 125 C198 131 188 143 180 159 C169 181 159 201 141 211 C123 221 101 217 89 202 C77 186 81 168 94 148 C109 124 123 101 132 79 Z"/>' +
    '<path fill="#E64F2E" d="M149 20 C160 27 163 36 160 44 C156 53 145 59 134 61 C139 52 141 45 140 38 C140 30 144 23 149 20 Z"/>' +
    '</svg>';
  const node = figma.createNodeFromSvg(svg);
  node.name = "G3 / Ember / Canonical Mark";
  node.resize(size, size);
  node.x = x;
  node.y = y;
  parent.appendChild(node);
  return node;
}
function findText(root, name) { return root.findOne((node) => node.type === "TEXT" && node.name === name); }

let page = figma.root.children.find((candidate) => candidate.type === "PAGE" && candidate.name === "04 - Personal Homepage")
  || figma.root.children.find((candidate) => candidate.type === "PAGE" && candidate.name === "03 - Playground");
if (!page) throw new Error("No available target page. Expected 03 - Playground on the current Starter-plan file.");
await page.loadAsync();
for (const child of [...page.children]) child.remove();
await figma.setCurrentPageAsync(page);

const oldStyles = (await figma.getLocalPaintStylesAsync()).filter((style) => style.name.startsWith("Tri Brand / Paper /"));
for (const style of oldStyles) style.remove();
const styles = {
  surface: solidStyle(figma.createPaintStyle(), COLORS.surface),
  panel: solidStyle(figma.createPaintStyle(), COLORS.panel),
  ink: solidStyle(figma.createPaintStyle(), COLORS.ink),
  accent: solidStyle(figma.createPaintStyle(), COLORS.accent),
  line: solidStyle(figma.createPaintStyle(), COLORS.line),
  forest: solidStyle(figma.createPaintStyle(), COLORS.forest)
};
styles.surface.name = "Tri Brand / Paper / Surface";
styles.panel.name = "Tri Brand / Paper / Panel";
styles.ink.name = "Tri Brand / Paper / Ink";
styles.accent.name = "Tri Brand / Paper / Ember";
styles.line.name = "Tri Brand / Paper / Line";
styles.forest.name = "Tri Brand / Paper / Forest";

const canvas = figma.createFrame();
canvas.name = "Personal Homepage / Paper / 1440x1024";
canvas.resize(1440, 1024);
canvas.x = 0;
canvas.y = 0;
canvas.fills = [{ type: "SOLID", color: COLORS.surface }];
canvas.strokes = [];
canvas.clipsContent = false;
  page.appendChild(canvas);

addLine(canvas, "Header / Rule", 64, 64, 1312, COLORS.line, 1);
addMark(canvas, 64, 29, 42);
await addText(canvas, "Header / Name", "Trí Nguyễn", 122, 35, 220, 18, COLORS.ink, "Bold", 1.1, -0.3);
await addText(canvas, "Header / Descriptor", "PERSONAL MASTER BRAND", 122, 58, 220, 9, COLORS.muted, "Bold", 1.2, 1.5, "IBM Plex Mono");
await addText(canvas, "Header / Work", "WORK", 930, 43, 70, 10, COLORS.muted, "Bold", 1.2, 1.1, "IBM Plex Mono");
await addText(canvas, "Header / Notes", "NOTES", 1020, 43, 70, 10, COLORS.muted, "Bold", 1.2, 1.1, "IBM Plex Mono");
await addText(canvas, "Header / About", "ABOUT", 1110, 43, 70, 10, COLORS.muted, "Bold", 1.2, 1.1, "IBM Plex Mono");
addRect(canvas, "Header / Contact Button", 1210, 31, 166, 36, COLORS.ink, 18);
await addText(canvas, "Header / Contact Label", "LET'S TALK ↗", 1235, 43, 125, 10, COLORS.surface, "Bold", 1.2, 1.1, "IBM Plex Mono");

await addText(canvas, "Hero / Eyebrow", "BUSINESS ANALYST  /  PRODUCT OWNER  /  PRODUCT MANAGER", 84, 168, 610, 10, COLORS.forest, "Bold", 1.2, 1.4, "IBM Plex Mono");
await addText(canvas, "Hero / Title", "Work, products,\nand ideas by Trí Nguyễn.", 80, 205, 650, 66, COLORS.ink, "Bold", 0.98, -2.2, "Georgia");
await addText(canvas, "Hero / Body", "I turn ambiguous problems into clear product direction, useful systems, and work that can move from idea to execution.", 84, 430, 500, 18, COLORS.muted, "Regular", 1.5, 0);
addRect(canvas, "Hero / Accent Rule", 84, 548, 92, 4, COLORS.accent, 2);
addRect(canvas, "Hero / Primary CTA", 84, 590, 182, 48, COLORS.ink, 24);
await addText(canvas, "Hero / Primary CTA Label", "VIEW SELECTED WORK →", 105, 608, 145, 10, COLORS.surface, "Bold", 1.2, 0.6, "IBM Plex Mono");
await addText(canvas, "Hero / Secondary CTA", "Read the point of view →", 292, 608, 210, 12, COLORS.ink, "Bold", 1.2, -0.1);

const heroCard = addFrame(canvas, "Hero / Authorship Sheet", 858, 144, 492, 482, COLORS.panel, 2, COLORS.line);
addRect(heroCard, "Authorship Sheet / Top Accent", 40, 46, 104, 4, COLORS.accent, 2);
await addText(heroCard, "Authorship Sheet / Meta", "AUTHORSHIP SHEET  /  01", 40, 76, 240, 10, COLORS.muted, "Bold", 1.2, 1.4, "IBM Plex Mono");
addLine(heroCard, "Authorship Sheet / Rule", 40, 112, 412, COLORS.line, 1);
addMark(heroCard, 171, 150, 150);
await addText(heroCard, "Authorship Sheet / Mark Label", "G3 / EMBER", 40, 374, 150, 10, COLORS.forest, "Bold", 1.2, 1.3, "IBM Plex Mono");
await addText(heroCard, "Authorship Sheet / Role", "PERSONAL IDENTITY", 40, 405, 380, 28, COLORS.ink, "Regular", 1.1, -0.8, "Georgia");
await addText(heroCard, "Authorship Sheet / Credit", "CREATED BY  Trí Nguyễn", 40, 448, 330, 12, COLORS.muted, "Regular", 1.2, 0, "Georgia");

await addText(canvas, "Selected / Label", "SELECTED WORK", 84, 704, 180, 11, COLORS.ink, "Bold", 1.2, 1.5, "IBM Plex Mono");
await addText(canvas, "Selected / Descriptor", "A small, living index of systems, product thinking, and experiments.", 84, 728, 610, 15, COLORS.muted, "Regular", 1.35, 0);
addLine(canvas, "Selected / Rule", 84, 760, 1272, COLORS.line, 1);

async function createWorkCardMaster() {
  const card = figma.createComponent();
  card.name = "Work Card / Default";
  card.resize(390, 184);
  card.x = 50;
  card.y = 1170;
  setFills(card, COLORS.panel);
  setStroke(card, COLORS.line, 1);
  card.cornerRadius = 2;
  addRect(card, "CardAccent", 24, 24, 54, 4, COLORS.accent, 2);
  await addText(card, "CardIndex", "01", 24, 46, 50, 10, COLORS.forest, "Bold", 1.2, 1.2, "IBM Plex Mono");
  await addText(card, "CardTitle", "ControlMux", 24, 70, 260, 24, COLORS.ink, "Regular", 1.05, -0.6, "Georgia");
  await addText(card, "CardDescription", "A local control plane for useful agent work.", 24, 108, 320, 13, COLORS.muted, "Regular", 1.3, 0);
  await addText(card, "CardType", "SYSTEMS  /  TOOLING", 24, 154, 260, 9, COLORS.muted, "Bold", 1.2, 1.2, "IBM Plex Mono");
  return card;
}
const cardMaster = await createWorkCardMaster();
const cardData = [
  { index: "01", title: "ControlMux", description: "A local control plane for useful agent work.", type: "SYSTEMS  /  TOOLING" },
  { index: "02", title: "Rental Manager Neo", description: "Operations made visible, calm, and actionable.", type: "PRODUCT  /  OPERATIONS" },
  { index: "03", title: "Notes on clarity", description: "Working ideas for better product decisions.", type: "WRITING  /  PRACTICE" }
];
const cardInstances = [];
for (let i = 0; i < cardData.length; i += 1) {
  const instance = cardMaster.createInstance();
  instance.name = "Work Card / " + cardData[i].title;
  instance.x = 84 + i * 424;
  instance.y = 790;
  canvas.appendChild(instance);
  const data = cardData[i];
  const index = findText(instance, "CardIndex");
  const title = findText(instance, "CardTitle");
  const description = findText(instance, "CardDescription");
  const type = findText(instance, "CardType");
  if (index) index.characters = data.index;
  if (title) title.characters = data.title;
  if (description) description.characters = data.description;
  if (type) type.characters = data.type;
  cardInstances.push(instance.id);
}

addLine(canvas, "Footer / Rule", 84, 986, 1272, COLORS.line, 1);
await addText(canvas, "Footer / Location", "BANGKOK  /  2026", 84, 997, 180, 9, COLORS.muted, "Bold", 1.2, 1.2, "IBM Plex Mono");
await addText(canvas, "Footer / Statement", "Work, products, and ideas by Trí Nguyễn.", 1010, 997, 346, 10, COLORS.muted, "Regular", 1.2, 0);

const snapshot = {
  page: { id: page.id, name: page.name },
  canvas: { id: canvas.id, name: canvas.name, width: canvas.width, height: canvas.height },
  component: { id: cardMaster.id, name: cardMaster.name, instanceIds: cardInstances },
  localPaintStyles: Object.values(styles).map((style) => ({ id: style.id, name: style.name })),
  directChildren: canvas.children.map((node) => ({ id: node.id, name: node.name, type: node.type })),
  designContract: {
    theme: "paper",
    sourceRevision: "source/VERSION 1.1.1",
    canonicalMark: "source/src/mark-data.js",
    viewport: "1440x1024",
    typography: { display: "Georgia Regular", body: "Arial Regular", meta: "IBM Plex Mono Bold" },
    repeatedComponent: "Work Card / Default",
    instances: cardInstances.length
  }
};
return snapshot;
`;

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status);
  if (process.argv.includes("--inspect")) {
    const result = await request(instance, inspectCode, "inspect-existing-file", "Inspect current Figma file before design authoring", "read", "inspect");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const result = await request(instance, createCode, "create-personal-homepage", "Create Paper personal homepage design with reusable work cards");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} finally {
  await runtime.close();
}

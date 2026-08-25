import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STATUS = new Set(["PENDING", "ACTIVE", "PASS", "FAIL", "BLOCKED", "NOT_RUN"]);
const NODE_TYPE = new Set(["FOUNDATION", "WALKING_SKELETON", "VERTICAL_SLICE", "HARDENING", "VERIFICATION"]);
const RELATION = new Set(["BLOCKS_TRUTH", "PROVED_BY", "INVALIDATES", "CONFLICTS_WRITE_WITH"]);
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const PLAN_KEYS = new Set(["schemaVersion", "planId", "objective", "terminalTruth", "state", "obligations", "nodes", "edges", "frontier", "notesPath"]);
const OBLIGATION_KEYS = new Set(["id", "sourceText", "required", "proofRequired", "status", "evidenceRefs", "blocker"]);
const NODE_KEYS = new Set(["id", "type", "label", "outcome", "status", "obligationIds", "dependsOn", "entrypoint", "proof", "evidenceRefs", "nonGoals", "recovery", "blocker"]);
const EDGE_KEYS = new Set(["from", "relation", "to"]);

export function validateWorkPlan(plan, { evidenceBaseDir = process.cwd() } = {}) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["plan must be an object"];
  validateKnownKeys("plan", plan, PLAN_KEYS, errors);
  if (plan.schemaVersion !== 3) errors.push("schemaVersion must equal 3");
  if (typeof plan.planId !== "string" || !ID.test(plan.planId)) errors.push("planId is invalid");
  if (!bounded(plan.objective, 500)) errors.push("objective must be 1-500 characters");
  if (!bounded(plan.terminalTruth, 500)) errors.push("terminalTruth must be 1-500 characters");
  if (!["ACTIVE", "PASS", "FAIL", "BLOCKED"].includes(plan.state)) errors.push("state is invalid");

  const ledgerEnabled = plan.obligations !== undefined;
  const obligations = new Map();
  if (ledgerEnabled && (!Array.isArray(plan.obligations) || plan.obligations.length === 0)) {
    errors.push("obligations must be a non-empty array when present");
  }
  for (const [index, obligation] of (plan.obligations ?? []).entries()) {
    if (!obligation || typeof obligation !== "object" || Array.isArray(obligation)) {
      errors.push(`obligation ${index} must be an object`);
      continue;
    }
    validateKnownKeys(`obligation ${obligation.id ?? index}`, obligation, OBLIGATION_KEYS, errors);
    if (typeof obligation.id !== "string" || !ID.test(obligation.id)) errors.push(`obligation ${index} id is invalid`);
    if (obligations.has(obligation.id)) errors.push(`duplicate obligation id ${obligation.id}`);
    obligations.set(obligation.id, obligation);
    if (!bounded(obligation.sourceText, 1000)) errors.push(`obligation ${obligation.id} sourceText is invalid`);
    if (typeof obligation.required !== "boolean") errors.push(`obligation ${obligation.id} required is invalid`);
    if (typeof obligation.proofRequired !== "boolean") errors.push(`obligation ${obligation.id} proofRequired is invalid`);
    if (!STATUS.has(obligation.status)) errors.push(`obligation ${obligation.id} status is invalid`);
    if (!uniqueStringList(obligation.evidenceRefs, 0, 300)) errors.push(`obligation ${obligation.id} evidenceRefs are invalid`);
    if (obligation.status === "PASS" && obligation.proofRequired && (obligation.evidenceRefs?.length ?? 0) === 0) errors.push(`passed obligation ${obligation.id} requires evidenceRefs`);
    if (obligation.status === "PASS" && obligation.proofRequired) validateEvidenceRefs(`passed obligation ${obligation.id}`, obligation.evidenceRefs, evidenceBaseDir, errors);
    if (obligation.status === "BLOCKED" && !bounded(obligation.blocker, 500)) errors.push(`blocked obligation ${obligation.id} requires blocker`);
    if (obligation.status !== "BLOCKED" && obligation.blocker !== "") errors.push(`non-blocked obligation ${obligation.id} must have an empty blocker`);
  }

  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) errors.push("nodes must be a non-empty array");
  const ids = new Set();
  const nodes = new Map();
  for (const [index, node] of (plan.nodes ?? []).entries()) {
    if (!node || typeof node !== "object" || Array.isArray(node)) { errors.push(`node ${index} must be an object`); continue; }
    validateKnownKeys(`node ${node.id ?? index}`, node, NODE_KEYS, errors);
    if (typeof node.id !== "string" || !ID.test(node.id)) errors.push(`node ${index} id is invalid`);
    if (ids.has(node.id)) errors.push(`duplicate node id ${node.id}`);
    ids.add(node.id);
    nodes.set(node.id, node);
    if (!NODE_TYPE.has(node.type)) errors.push(`node ${node.id} type is invalid`);
    if (!bounded(node.label, 100)) errors.push(`node ${node.id} label is invalid`);
    if (!bounded(node.outcome, 500)) errors.push(`node ${node.id} outcome is invalid`);
    if (!STATUS.has(node.status)) errors.push(`node ${node.id} status is invalid`);
    if (ledgerEnabled && !uniqueIdList(node.obligationIds, 1)) errors.push(`node ${node.id} obligationIds are invalid`);
    if (!ledgerEnabled && node.obligationIds !== undefined && !uniqueIdList(node.obligationIds, 0)) errors.push(`node ${node.id} obligationIds are invalid`);
    if (!Array.isArray(node.dependsOn) || new Set(node.dependsOn).size !== node.dependsOn.length) errors.push(`node ${node.id} dependsOn is invalid`);
    if (!bounded(node.entrypoint, 300)) errors.push(`node ${node.id} entrypoint is invalid`);
    if (!stringList(node.proof, 1, 300)) errors.push(`node ${node.id} proof is invalid`);
    if (node.evidenceRefs !== undefined && !uniqueStringList(node.evidenceRefs, 0, 300)) errors.push(`node ${node.id} evidenceRefs are invalid`);
    if (ledgerEnabled && node.status === "PASS" && (node.evidenceRefs?.length ?? 0) === 0) errors.push(`passed node ${node.id} requires evidenceRefs`);
    if (ledgerEnabled && node.status === "PASS") validateEvidenceRefs(`passed node ${node.id}`, node.evidenceRefs, evidenceBaseDir, errors);
    if (!stringList(node.nonGoals, 0, 300)) errors.push(`node ${node.id} nonGoals is invalid`);
    if (!bounded(node.recovery, 500)) errors.push(`node ${node.id} recovery is invalid`);
    if (node.status === "BLOCKED" && !bounded(node.blocker, 500)) errors.push(`blocked node ${node.id} requires blocker`);
  }

  const activeNodes = [...nodes.values()].filter((node) => node.status === "ACTIVE");
  if (activeNodes.length > 1) errors.push("at most one node may be ACTIVE");

  for (const node of nodes.values()) {
    for (const obligationId of node.obligationIds ?? []) {
      if (!obligations.has(obligationId)) errors.push(`node ${node.id} references unknown obligation ${obligationId}`);
    }
    for (const dependency of node.dependsOn ?? []) {
      if (!nodes.has(dependency)) errors.push(`node ${node.id} depends on unknown node ${dependency}`);
      if (dependency === node.id) errors.push(`node ${node.id} cannot depend on itself`);
    }
  }
  if (hasCycle(nodes)) errors.push("dependency graph contains a cycle");

  if (ledgerEnabled) {
    for (const obligation of obligations.values()) {
      if (obligation.required && ![...nodes.values()].some((node) => node.obligationIds?.includes(obligation.id))) {
        errors.push(`required obligation ${obligation.id} is not covered by any node`);
      }
    }
  }

  if (!Array.isArray(plan.edges)) errors.push("edges must be an array");
  const edgeKeys = new Set();
  for (const [index, edge] of (plan.edges ?? []).entries()) {
    if (edge && typeof edge === "object" && !Array.isArray(edge)) validateKnownKeys(`edge ${index}`, edge, EDGE_KEYS, errors);
    if (!nodes.has(edge?.from) || !nodes.has(edge?.to) || !RELATION.has(edge?.relation)) errors.push(`edge ${index} is invalid`);
    const key = `${edge?.from}|${edge?.relation}|${edge?.to}`;
    if (edgeKeys.has(key)) errors.push(`duplicate edge ${key}`);
    edgeKeys.add(key);
  }

  if (!Array.isArray(plan.frontier) || new Set(plan.frontier ?? []).size !== (plan.frontier?.length ?? 0)) errors.push("frontier must be a unique array");
  else if (plan.state === "ACTIVE" && plan.frontier.length === 0) errors.push("an ACTIVE plan requires a non-empty frontier");
  for (const id of plan.frontier ?? []) {
    if (!nodes.has(id)) errors.push(`frontier references unknown node ${id}`);
    const node = nodes.get(id);
    if (node && !["PENDING", "ACTIVE"].includes(node.status)) errors.push(`frontier node ${id} must be PENDING or ACTIVE`);
    for (const dependency of node?.dependsOn ?? []) {
      if (nodes.get(dependency)?.status !== "PASS") errors.push(`frontier node ${id} has incomplete dependency ${dependency}`);
    }
    if (ledgerEnabled && node) {
      const mapped = (node.obligationIds ?? []).map((obligationId) => obligations.get(obligationId)).filter(Boolean);
      if (mapped.some((obligation) => ["FAIL", "BLOCKED"].includes(obligation.status))) errors.push(`frontier node ${id} has a failed or blocked obligation`);
    }
  }
  for (const node of activeNodes) {
    if (!plan.frontier?.includes(node.id)) errors.push(`active node ${node.id} must be in frontier`);
  }

  if (ledgerEnabled && plan.state === "PASS") {
    if ((plan.frontier?.length ?? 0) !== 0) errors.push("a PASS plan requires an empty frontier");
    for (const obligation of obligations.values()) {
      if (!obligation.required) continue;
      if (obligation.status !== "PASS") errors.push(`PASS plan has unresolved required obligation ${obligation.id}`);
      const mappedNodes = [...nodes.values()].filter((node) => node.obligationIds?.includes(obligation.id));
      if (mappedNodes.some((node) => node.status !== "PASS")) errors.push(`PASS plan has unresolved node for required obligation ${obligation.id}`);
    }
  }
  if (!bounded(plan.notesPath, 260)) errors.push("notesPath is invalid");
  return errors;
}

export function renderWorkPlanSvg(plan) {
  const errors = validateWorkPlan(plan);
  if (errors.length) throw new Error(`Invalid work plan:\n- ${errors.join("\n- ")}`);
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const depth = new Map();
  const getDepth = (id) => {
    if (depth.has(id)) return depth.get(id);
    const value = Math.max(0, ...nodes.get(id).dependsOn.map((dependency) => getDepth(dependency) + 1));
    depth.set(id, value);
    return value;
  };
  for (const id of nodes.keys()) getDepth(id);
  const columns = new Map();
  for (const node of plan.nodes) {
    const d = depth.get(node.id);
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(node);
  }
  const columnCount = Math.max(...columns.keys()) + 1;
  const rowCount = Math.max(...[...columns.values()].map((items) => items.length));
  const cardW = 260;
  const cardH = 132;
  const gapX = 78;
  const gapY = 32;
  const originX = 46;
  const originY = 174;
  const width = Math.max(980, originX * 2 + columnCount * cardW + (columnCount - 1) * gapX);
  const height = originY + rowCount * cardH + Math.max(0, rowCount - 1) * gapY + 92;
  const positions = new Map();
  for (const [d, items] of columns) {
    items.forEach((node, row) => positions.set(node.id, { x: originX + d * (cardW + gapX), y: originY + row * (cardH + gapY) }));
  }

  const frontierLabel = plan.frontier.length ? plan.frontier.join(" · ") : `none (${plan.state})`;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#727783"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#f4f2ed"/>`,
    `<text x="46" y="50" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="700" letter-spacing="1.2" fill="#626772">${esc(plan.planId.toUpperCase())}</text>`,
    `<text x="46" y="84" font-family="Inter,Segoe UI,sans-serif" font-size="26" font-weight="750" fill="#17191d">${esc(trim(plan.objective, 76))}</text>`,
    `<text x="46" y="112" font-family="Inter,Segoe UI,sans-serif" font-size="13" fill="#626772">Current frontier: ${esc(frontierLabel)} · semantic work state / evidence graph</text>`,
    `<g font-family="Inter,Segoe UI,sans-serif">`,
  ];
  for (const edge of plan.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    const x1 = from.x + cardW;
    const y1 = from.y + cardH / 2;
    const x2 = to.x;
    const y2 = to.y + cardH / 2;
    const bend = (x1 + x2) / 2;
    parts.push(`<path d="M ${x1} ${y1} C ${bend} ${y1}, ${bend} ${y2}, ${x2 - 8} ${y2}" fill="none" stroke="#a5a8af" stroke-width="1.5" marker-end="url(#arrow)"/>`);
    parts.push(`<text x="${bend}" y="${Math.min(y1, y2) - 7}" text-anchor="middle" font-size="9" font-weight="700" fill="#727783">${esc(edge.relation)}</text>`);
  }
  for (const node of plan.nodes) {
    const pos = positions.get(node.id);
    const palette = statusPalette(node.status);
    const active = plan.frontier.includes(node.id);
    parts.push(`<g transform="translate(${pos.x} ${pos.y})">`);
    parts.push(`<rect width="${cardW}" height="${cardH}" rx="18" fill="#ffffff" stroke="${active ? "#4b66e8" : "#d8d5ce"}" stroke-width="${active ? 2.5 : 1}"/>`);
    parts.push(`<rect x="16" y="15" width="${Math.max(58, node.status.length * 7 + 18)}" height="24" rx="12" fill="${palette.bg}"/>`);
    parts.push(`<text x="26" y="31" font-size="10" font-weight="800" fill="${palette.fg}">${esc(node.status)}</text>`);
    parts.push(`<text x="16" y="58" font-size="15" font-weight="750" fill="#17191d">${esc(trim(node.label, 30))}</text>`);
    wrap(node.outcome, 42, 2).forEach((line, index) => parts.push(`<text x="16" y="${79 + index * 16}" font-size="11" fill="#626772">${esc(line)}</text>`));
    parts.push(`<text x="16" y="119" font-size="9.5" font-weight="650" fill="#4b66e8">${esc(node.type)}</text>`);
    parts.push(`</g>`);
  }
  parts.push(`</g>`);
  parts.push(`<g transform="translate(46 ${height - 42})" font-family="Inter,Segoe UI,sans-serif" font-size="10" fill="#626772"><text>Relation graph · JSON is canonical · visual is a projection</text></g>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

function validateKnownKeys(label, value, allowed, errors) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${label} contains unsupported field ${key}`);
}
function bounded(value, max) { return typeof value === "string" && value.length > 0 && value.length <= max; }
function stringList(value, min, max) { return Array.isArray(value) && value.length >= min && value.every((item) => bounded(item, max)); }
function uniqueStringList(value, min, max) { return stringList(value, min, max) && new Set(value).size === value.length; }
function uniqueIdList(value, min) { return Array.isArray(value) && value.length >= min && value.every((item) => typeof item === "string" && ID.test(item)) && new Set(value).size === value.length; }
function hasCycle(nodes) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id) || !nodes.has(id)) return false;
    visiting.add(id);
    for (const dependency of nodes.get(id).dependsOn ?? []) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...nodes.keys()].some(visit);
}
function esc(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]); }
function validateEvidenceRefs(label, refs, evidenceBaseDir, errors) {
  if (!Array.isArray(refs)) return;
  for (const ref of refs) {
    if (typeof ref !== "string" || ref.length === 0) continue;
    const candidate = isAbsolute(ref) ? ref : resolve(evidenceBaseDir, ref);
    if (!existsSync(candidate)) errors.push(`${label} evidenceRef does not exist: ${ref}`);
  }
}
function trim(value, max) { const text = String(value); return text.length <= max ? text : `${text.slice(0, max - 1)}…`; }
function wrap(value, max, lines) {
  const words = String(value).split(/\s+/);
  const output = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) line = next;
    else { output.push(line); line = word; if (output.length === lines - 1) break; }
  }
  if (line && output.length < lines) output.push(line);
  const consumed = output.join(" ").length;
  if (consumed < String(value).length && output.length) output[output.length - 1] = trim(output[output.length - 1], max - 1) + "…";
  return output;
}
function statusPalette(status) {
  if (status === "PASS") return { bg: "#e2f4eb", fg: "#267657" };
  if (status === "ACTIVE") return { bg: "#e8ecff", fg: "#3e56c7" };
  if (status === "FAIL") return { bg: "#fae4e4", fg: "#a83e3e" };
  if (status === "BLOCKED") return { bg: "#faead7", fg: "#9b5a1d" };
  if (status === "NOT_RUN") return { bg: "#ececef", fg: "#656975" };
  return { bg: "#efeee9", fg: "#656975" };
}

async function main() {
  const [command, input, output] = process.argv.slice(2);
  if (!command || !input || !["validate", "render"].includes(command)) {
    throw new Error("Usage: work-plan.mjs <validate|render> <plan.json> [output.svg]");
  }
  const plan = JSON.parse(await readFile(input, "utf8"));
  const errors = validateWorkPlan(plan);
  if (errors.length) throw new Error(`Invalid work plan:\n- ${errors.join("\n- ")}`);
  if (command === "validate") {
    process.stdout.write(`${JSON.stringify({ valid: true, planId: plan.planId, nodes: plan.nodes.length, frontier: plan.frontier })}\n`);
    return;
  }
  if (!output) throw new Error("render requires output.svg");
  await writeFile(output, renderWorkPlanSvg(plan), "utf8");
  process.stdout.write(`${JSON.stringify({ rendered: output, planId: plan.planId, nodes: plan.nodes.length })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

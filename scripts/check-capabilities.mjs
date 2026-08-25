import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const requiredPluginPackageFiles = [
  "package.json",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".mcp.json",
  "THIRD_PARTY_NOTICES.md",
];
for (const relativePath of requiredPluginPackageFiles) {
  if (!existsSync(resolve(root, relativePath))) throw new Error(`Required plugin/MCP package file missing: ${relativePath}`);
}

const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (packageManifest.scripts?.["check:trajectory-evidence"] !== "node scripts/check-trajectory-evidence.mjs" || !String(packageManifest.scripts?.["check:capabilities"] ?? "").startsWith("node scripts/check-trajectory-evidence.mjs && ")) {
  throw new Error("P3-Q1 trajectory evidence gate is not wired into check:capabilities.");
}
if (!Array.isArray(packageManifest.files) || !packageManifest.files.includes("THIRD_PARTY_NOTICES.md")) {
  throw new Error("package.json must ship THIRD_PARTY_NOTICES.md with the self-contained server bundle.");
}
const thirdPartyNotices = readFileSync(resolve(root, "THIRD_PARTY_NOTICES.md"), "utf8");
for (const dependency of ["@modelcontextprotocol/sdk", "ajv", "ajv-formats", "fast-deep-equal", "fast-uri", "json-schema-traverse", "ws", "zod", "zod-to-json-schema"]) {
  if (!thirdPartyNotices.includes(`## ${dependency}@`)) throw new Error(`THIRD_PARTY_NOTICES.md is missing bundled runtime dependency ${dependency}.`);
}
const codexManifest = JSON.parse(readFileSync(resolve(root, ".codex-plugin/plugin.json"), "utf8"));
const claudeManifest = JSON.parse(readFileSync(resolve(root, ".claude-plugin/plugin.json"), "utf8"));
if (typeof packageManifest.version !== "string" || packageManifest.version.length === 0) {
  throw new Error("package.json must declare a non-empty string version.");
}
for (const [relativePath, manifest] of [[".codex-plugin/plugin.json", codexManifest], [".claude-plugin/plugin.json", claudeManifest]]) {
  if (manifest.version !== packageManifest.version) {
    throw new Error(`Plugin version drift: package.json=${packageManifest.version}; ${relativePath}=${String(manifest.version)}`);
  }
}

const mcpConfig = JSON.parse(readFileSync(resolve(root, ".mcp.json"), "utf8"));
const mcpServer = mcpConfig?.mcpServers?.["figma-plugin"];
if (mcpServer?.command !== "node" || !Array.isArray(mcpServer.args) || !mcpServer.args.includes("./dist/server/index.js")) {
  throw new Error(".mcp.json must register figma-plugin with the bundled ./dist/server/index.js entrypoint.");
}
if (codexManifest.mcpServers !== "./.mcp.json") throw new Error("Codex plugin manifest must reference ./.mcp.json.");
const claudeServer = claudeManifest?.mcpServers?.["figma-plugin"];
if (claudeServer?.command !== "node" || !Array.isArray(claudeServer.args) || !claudeServer.args.includes("${CLAUDE_PLUGIN_ROOT}/dist/server/index.js")) {
  throw new Error("Claude plugin manifest must register the bundled dist/server/index.js entrypoint.");
}

const registryPath = resolve(root, "src/capabilities/skill-registry.ts");
const registrySource = readFileSync(registryPath, "utf8");
const registryLines = registrySource.split("\n").filter((line) => /^\s*\{ id: "[a-z0-9-]+"/.test(line));
const ids = registryLines.map((line) => line.match(/id: "([a-z0-9-]+)"/)?.[1]).filter(Boolean);

if (ids.length === 0) throw new Error("Capability registry contains no Skill identities.");
if (new Set(ids).size !== ids.length) throw new Error("Capability registry contains duplicate Skill identities.");
for (const line of registryLines) {
  if (!line.includes("editors: [")) throw new Error(`Skill registry entry is missing deep editor scope: ${line.trim()}`);
  if (!line.includes("evidence: {")) throw new Error(`Skill registry entry is missing evidence policy: ${line.trim()}`);
}

const skillRoot = resolve(root, "skills");
const directories = readdirSync(skillRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expected = [...ids].sort();
if (JSON.stringify(directories) !== JSON.stringify(expected)) {
  throw new Error(`Skill directory drift. registry=${expected.join(",")} folders=${directories.join(",")}`);
}

for (const id of ids) {
  const entry = resolve(skillRoot, id, "SKILL.md");
  const provenance = resolve(skillRoot, id, "references/provenance.md");
  const agentMeta = resolve(skillRoot, id, "agents/openai.yaml");
  if (!existsSync(entry)) throw new Error(`Missing ${id}/SKILL.md`);
  if (!existsSync(provenance)) throw new Error(`Missing ${id}/references/provenance.md`);
  if (!existsSync(agentMeta)) throw new Error(`Missing ${id}/agents/openai.yaml`);
  const skillSource = readFileSync(entry, "utf8").replace(/\r\n?/g, "\n");
  if (!skillSource.startsWith(`---\nname: ${id}\n`)) throw new Error(`Skill frontmatter name mismatch for ${id}`);
}

const distillation = readFileSync(resolve(root, "docs/DISTILLATION.md"), "utf8");
for (const id of ids) {
  if (!distillation.includes(`\`${id}\``)) throw new Error(`DISTILLATION.md is missing ${id}`);
}

const evals = JSON.parse(readFileSync(resolve(root, "evals/skill-boundaries.json"), "utf8"));
const evalOwners = evals.cases.map((item) => item.owner).sort();
if (JSON.stringify(evalOwners) !== JSON.stringify(expected)) {
  throw new Error(`Skill eval coverage drift. registry=${expected.join(",")} evals=${evalOwners.join(",")}`);
}
if (evals.status !== "FROZEN_NOT_RUN") throw new Error("Skill boundary eval status must remain explicit until behavioral execution occurs.");
const validEvidence = new Set(evals.evidenceDimensions ?? []);
if (validEvidence.size === 0) throw new Error("Evidence vector is missing from skill-boundaries.json.");
for (const item of evals.cases) {
  if (!Array.isArray(item.evidenceRequired)) throw new Error(`Eval case ${item.owner} is missing evidenceRequired.`);
  for (const dimension of item.evidenceRequired) {
    if (!validEvidence.has(dimension)) throw new Error(`Eval case ${item.owner} uses unknown evidence dimension ${dimension}.`);
  }
}

const providerPath = resolve(root, "src/capabilities/provider-evidence.ts");
if (!existsSync(providerPath)) throw new Error("Missing provider evidence snapshot/schema.");
const providerSource = readFileSync(providerPath, "utf8");
for (const marker of ["connected-tool-schema", "runtimeRevalidationRequired: true", 'id: "use_figma"', 'id: "get_design_context"', 'id: "get_motion_context"', 'id: "download_assets"', 'id: "upload_assets"']) {
  if (!providerSource.includes(marker)) throw new Error(`Provider evidence snapshot is missing required marker: ${marker}`);
}

const migrationNames = new Map((evals.topologyMigrations ?? []).map((item) => [item.proposal, item.status]));
if (migrationNames.get("split-prototype-from-motion") !== "APPROVED_MATERIALIZED") {
  throw new Error("Prototype/Motion topology migration is not closed.");
}
if (migrationNames.get("add-figma-verification") !== "APPROVED_MATERIALIZED") {
  throw new Error("Verification topology migration is not closed.");
}
if (migrationNames.get("add-figma-design-to-design") !== "APPROVED_MATERIALIZED") {
  throw new Error("Design-to-Design topology migration is not closed.");
}
const motionToCode = (evals.capabilityCandidates ?? []).find((item) => item.candidate === "figma-motion-to-code");
if (!motionToCode || motionToCode.status !== "REFERENCE_BRANCH_MATERIALIZED_NOT_RUN" || motionToCode.currentOwner !== "figma-design-to-code") {
  throw new Error("figma-motion-to-code must remain an explicit unmaterialized candidate owned as a figma-design-to-code reference branch until behavioral proof earns a split.");
}
if (!existsSync(resolve(root, motionToCode.reference ?? ""))) {
  throw new Error("figma-motion-to-code reference branch is missing from the package.");
}

const valueEvals = JSON.parse(readFileSync(resolve(root, "evals/skill-value.json"), "utf8"));
if (valueEvals.status !== "FROZEN_NOT_RUN") throw new Error("Skill value eval status must remain FROZEN_NOT_RUN until representative executions occur.");
const valueOwners = valueEvals.cases.map((item) => item.owner).sort();
if (JSON.stringify(valueOwners) !== JSON.stringify(expected)) {
  throw new Error(`Skill value eval coverage drift. registry=${expected.join(",")} valueEvals=${valueOwners.join(",")}`);
}
if (valueEvals.principle?.ordering?.[0] !== "capability-quality" || valueEvals.principle?.ordering?.[2] !== "io-fitness") {
  throw new Error("Skill value eval must preserve capability-first, I/O-after-quality ordering.");
}
if (!Array.isArray(valueEvals.ioMetrics) || !valueEvals.ioMetrics.includes("bridge-request-bytes") || !valueEvals.ioMetrics.includes("retry-count")) {
  throw new Error("Skill value eval is missing required I/O fitness metrics.");
}

const protocolSource = readFileSync(resolve(root, "src/shared/protocol.ts"), "utf8");
const mcpSource = readFileSync(resolve(root, "src/server/mcp-surface.ts"), "utf8");
const buildSource = readFileSync(resolve(root, "scripts/build.mjs"), "utf8");
const manifestSource = readFileSync(resolve(root, "plugin/manifest.json"), "utf8");
for (const required of ['"export_node"', 'PROTOCOL_VERSION = 10', 'MAX_BINARY_ARTIFACT_BYTES']) if (!protocolSource.includes(required)) throw new Error(`Protocol is missing 0.7.0 export marker: ${required}`);
for (const required of ['name: "figma_status"', 'name: "figma_query"', 'name: "figma_apply"', 'name: "figma_exec"', 'name: "figma_export"']) if (!mcpSource.includes(required)) throw new Error(`MCP surface is missing tool marker: ${required}`);
for (const required of [
  'outputSchema: toolOutputSchema',
  'structuredContent: structuredSuccess',
  'requiredOperation(',
  'possiblyCommitted',
  'providerStateUnknown',
  'MCP_SERVER_INSTRUCTIONS',
  'readOnlyHint: true',
  'destructiveHint: true',
]) if (!mcpSource.includes(required)) throw new Error(`MCP accountable I/O contract marker missing: ${required}`);
if (buildSource.includes('packages: "external"') || !existsSync(resolve(root, "scripts/smoke-self-contained-server.mjs"))) {
  throw new Error("Packaged MCP server must bundle runtime dependencies and retain a standalone bundle smoke.");
}
if (!manifestSource.includes('"teamlibrary"')) throw new Error("Figma manifest is missing teamlibrary permission required by local library inspection.");

const craftDocPath = resolve(root, "docs/CRAFT-EXEMPLARS.md");
if (!existsSync(craftDocPath)) throw new Error("Missing docs/CRAFT-EXEMPLARS.md");
const craftDoc = readFileSync(craftDocPath, "utf8");
for (const id of ["figma-design-authoring", "figma-layout", "figma-scene", "figma-visual-system", "figma-typography"]) {
  if (!craftDoc.includes(`\`${id}\``)) throw new Error(`CRAFT-EXEMPLARS.md is missing craft-core Skill ${id}`);
}

const craftEvals = JSON.parse(readFileSync(resolve(root, "evals/craft-exemplars.json"), "utf8"));
if (craftEvals.status !== "SELF_REVIEWED_NOT_BEHAVIORALLY_RUN") {
  throw new Error("Craft exemplar status must preserve self-review vs behavioral qualification truth.");
}
if (craftEvals.projectEvidence?.selfReview !== "PASS" || craftEvals.projectEvidence?.behavioralSkillAB !== "NOT_RUN") {
  throw new Error("Craft exemplar evidence must keep visual self-review separate from behavioral Skill proof.");
}
for (const path of [craftEvals.projectEvidence?.productTruth, ...(craftEvals.projectEvidence?.specimens ?? []), ...(craftEvals.projectEvidence?.renders ?? [])]) {
  if (!path || !existsSync(resolve(root, path))) throw new Error(`Craft exemplar evidence is missing: ${path}`);
}
const craftOwners = new Set();
for (const item of craftEvals.craftCoreSkills ?? []) {
  if (!ids.includes(item.owner)) throw new Error(`Craft exemplar owner is not a canonical Skill: ${item.owner}`);
  craftOwners.add(item.owner);
  const referencePath = resolve(root, item.reference ?? "");
  if (!existsSync(referencePath)) throw new Error(`Craft exemplar reference is missing for ${item.owner}: ${item.reference}`);
}
for (const required of ["figma-design-authoring", "figma-layout", "figma-scene", "figma-visual-system", "figma-typography"]) {
  if (!craftOwners.has(required)) throw new Error(`Craft-core Skill lacks qualified teaching cases: ${required}`);
}
const craftBehaviorOwners = new Set();
for (const item of craftEvals.behavioralCases ?? []) {
  craftBehaviorOwners.add(item.owner);
  if (item.status !== "NOT_RUN") throw new Error(`Craft behavioral case ${item.owner} must remain NOT_RUN until representative execution occurs.`);
  if (!Array.isArray(item.expectedDelta) || item.expectedDelta.length < 3 || !item.failureSignal) {
    throw new Error(`Craft behavioral case ${item.owner} is too weak to falsify the claimed delta.`);
  }
}
for (const required of craftOwners) {
  if (!craftBehaviorOwners.has(required)) throw new Error(`Craft-core Skill lacks frozen behavioral craft case: ${required}`);
}

if (craftEvals.behavioralCoreEvidence?.methodReview !== "PASS" || craftEvals.behavioralCoreEvidence?.figmaExecution !== "NOT_RUN") {
  throw new Error("Behavioral-component exemplar truth must keep method review separate from actual Figma execution.");
}
const behavioralCoreOwners = new Set();
for (const item of craftEvals.behavioralCoreSkills ?? []) {
  if (!ids.includes(item.owner)) throw new Error(`Behavioral exemplar owner is not canonical: ${item.owner}`);
  if (item.figmaExecution !== "NOT_RUN") throw new Error(`Behavioral exemplar ${item.owner} must stay NOT_RUN until representative Figma execution.`);
  behavioralCoreOwners.add(item.owner);
  const referencePath = resolve(root, item.reference ?? "");
  if (!existsSync(referencePath)) throw new Error(`Behavioral exemplar reference missing for ${item.owner}: ${item.reference}`);
  if (!craftBehaviorOwners.has(item.owner)) throw new Error(`Behavioral-core Skill lacks frozen behavioral case: ${item.owner}`);
}
for (const required of ["figma-components", "figma-prototype"]) {
  if (!behavioralCoreOwners.has(required)) throw new Error(`Behavioral-core Skill lacks golden teaching cases: ${required}`);
}

for (const requiredPath of [
  "skills/figma-design-to-design/references/design-transfer-packet.schema.json",
  "skills/figma-design-to-design/references/transfer-ledger.schema.json",
  "skills/figma-design-to-design/scripts/validate_transfer_packet.py",
  "skills/figma-design-to-design/scripts/init_transfer_ledger.py",
  "skills/figma-design-to-code/references/design-translation-packet.schema.json",
  "skills/figma-design-to-code/scripts/validate_translation_packet.py",
]) {
  if (!existsSync(resolve(root, requiredPath))) throw new Error(`Lifecycle packet contract missing: ${requiredPath}`);
}

for (const requiredPath of [
  "skills/figma-design-authoring/references/progressive-workflow.md",
  "skills/figma-design-authoring/schemas/work-plan.schema.json",
  "skills/figma-design-authoring/templates/work-plan.json",
  "skills/figma-design-authoring/scripts/work-plan.mjs",
  "skills/figma-native/references/runtime-sdk.md",
  "skills/figma-native/references/execution-contract.md",
  "src/plugin/runtime-sdk.ts",
  "skills/figma-components/references/reuse-registry.md",
  "skills/figma-components/references/reuse-registry.schema.json",
  "skills/figma-components/templates/reuse-registry.json",
  "skills/figma-components/scripts/validate-reuse-registry.mjs",
  "evals/agent-execution.json",
  "evals/fixtures/work-plan.blocked.json",
  "evals/fixtures/work-plan.blocked.notes.md",
  "evals/fixtures/reuse-registry.valid.json",
]) {
  if (!existsSync(resolve(root, requiredPath))) throw new Error(`Agent execution upgrade artifact missing: ${requiredPath}`);
}

if (!mcpSource.includes("runtimeSdk") || !protocolSource.includes("runtimeSdks") || !protocolSource.includes("RUNTIME_SDK_VERSIONS")) throw new Error("Runtime SDK versions are not exposed through MCP and companion capability handshake.");
for (const marker of ["collection: { ...ENTITY_REF_SCHEMA", "alias: { ...ENTITY_REF_SCHEMA"]) {
  if (!mcpSource.includes(marker)) throw new Error(`P2-T1 MCP modeled identity edge missing: ${marker}`);
}
if (!mcpSource.includes("variable: { ...ENTITY_REF_SCHEMA")) throw new Error("P2-T2 MCP modeled variable binding edge is missing.");
const layoutRuntimeSource = readFileSync(resolve(root, "src/plugin/handlers/entity-mutation-operations.ts"), "utf8");
if (!protocolSource.includes('"layout_command"') || !layoutRuntimeSource.includes('command === "configure_grid"') || !layoutRuntimeSource.includes("setGridChildPosition")) throw new Error("P2-L1 typed Grid runtime contract is missing.");
for (const marker of ["planId", "stepId", "representation"]) if (!protocolSource.includes(marker) || !mcpSource.includes(marker)) throw new Error(`Plan-aware operation marker missing: ${marker}`);

const { validateWorkPlan } = await import(pathToFileURL(resolve(root, "skills/figma-design-authoring/scripts/work-plan.mjs")).href);
const workPlanTemplate = JSON.parse(readFileSync(resolve(root, "skills/figma-design-authoring/templates/work-plan.json"), "utf8"));
const templateErrors = validateWorkPlan(workPlanTemplate);
if (workPlanTemplate.schemaVersion !== 3 || templateErrors.length) throw new Error(`Semantic work-plan v3 template is invalid: ${templateErrors.join("; ")}`);
const blockedPlanFixture = JSON.parse(readFileSync(resolve(root, "evals/fixtures/work-plan.blocked.json"), "utf8"));
const blockedPlanErrors = validateWorkPlan(blockedPlanFixture);
if (blockedPlanFixture.schemaVersion !== 3 || blockedPlanErrors.length) throw new Error(`Blocked semantic work-plan fixture is invalid: ${blockedPlanErrors.join("; ")}`);

const { validateReuseRegistry } = await import(pathToFileURL(resolve(root, "skills/figma-components/scripts/validate-reuse-registry.mjs")).href);
const reuseRegistry = JSON.parse(readFileSync(resolve(root, "evals/fixtures/reuse-registry.valid.json"), "utf8"));
const registryErrors = validateReuseRegistry(reuseRegistry);
if (registryErrors.length) throw new Error(`Reuse Registry fixture is invalid: ${registryErrors.join("; ")}`);

const agentExecution = JSON.parse(readFileSync(resolve(root, "evals/agent-execution.json"), "utf8"));
if (agentExecution.status !== "MECHANISM_TESTED_BEHAVIORAL_COMPARISON_NOT_RUN") throw new Error("Agent execution eval must separate mechanism proof from behavioral comparison.");
if (agentExecution.claims?.behavioralSkillComparison !== "NOT_RUN" || agentExecution.claims?.crossFileLibraryReuse !== "NOT_RUN" || agentExecution.claims?.designToCodeParity !== "NOT_RUN") {
  throw new Error("Agent execution eval overclaims behavioral, cross-file reuse, or design-to-code evidence.");
}
if (agentExecution.claims?.observableTrajectoryEvidence !== "IMPLEMENTED_TESTED_LOCAL") {
  throw new Error("P3-Q1 observable trajectory evidence must be marked IMPLEMENTED_TESTED_LOCAL without upgrading behavioral comparison.");
}
if (!existsSync(resolve(root, "docs/TRAJECTORY-EVIDENCE.md"))) throw new Error("Missing canonical observable trajectory evidence contract.");
for (const item of agentExecution.cases ?? []) {
  if (item.status !== "FROZEN_NOT_RUN" || !Array.isArray(item.failureSignals) || item.failureSignals.length < 3) throw new Error(`Agent execution case is not falsifiable/frozen: ${item.id}`);
}
for (const evidencePath of agentExecution.mechanismEvidence ?? []) if (!existsSync(resolve(root, evidencePath))) throw new Error(`Agent execution mechanism evidence missing: ${evidencePath}`);

// Active truth gate: historical evidence may retain its captured revision, but current owner docs/evals must bind to this package/protocol.
const protocolMatch = protocolSource.match(/PROTOCOL_VERSION\s*=\s*(\d+)/);
if (!protocolMatch) throw new Error("Unable to resolve PROTOCOL_VERSION from src/shared/protocol.ts.");
const activeProtocolVersion = Number(protocolMatch[1]);
const currentTruthDocs = [
  "README.md",
  "docs/CAPABILITIES.md",
  "docs/SOURCE-ARCHITECTURE.md",
  "docs/AGENT-SKILL-VALUE.md",
  "docs/CRAFT-EXEMPLARS.md",
  "docs/DESIGN-LIFECYCLE.md",
  "docs/EXPORT.md",
  `docs/PLUGIN-${packageManifest.version}-TYPED-CRUD.md`,
];
for (const relativePath of currentTruthDocs) {
  if (!existsSync(resolve(root, relativePath))) throw new Error(`Active truth document missing: ${relativePath}`);
  const source = readFileSync(resolve(root, relativePath), "utf8");
  if (!source.includes(packageManifest.version)) throw new Error(`Active truth version drift: ${relativePath} does not name package ${packageManifest.version}.`);
  if (!(source.includes(`Protocol: \`${activeProtocolVersion}\``) || source.includes(`Protocol ${activeProtocolVersion}`) || source.includes(`protocol **v${activeProtocolVersion}**`) || source.includes(`Protocol: ${activeProtocolVersion}`))) {
    throw new Error(`Active truth protocol drift: ${relativePath} does not name protocol ${activeProtocolVersion}.`);
  }
}
const entityEvidenceSource = readFileSync(resolve(root, "src/plugin/handlers/entity-evidence.ts"), "utf8");
const entityMutationSource = readFileSync(resolve(root, "src/plugin/handlers/entity-mutation-operations.ts"), "utf8");
const entityOperationsSource = `${entityEvidenceSource}\n${entityMutationSource}`;
if (!entityEvidenceSource.includes('projection.has("visual")') || !entityEvidenceSource.includes("fills: safeJson(dynamic.fills)") || !entityEvidenceSource.includes("strokes: safeJson(dynamic.strokes)")) {
  throw new Error("Accessibility visual evidence projection is missing from the typed entity query path.");
}
if (!entityMutationSource.includes("applyManualKeyframeTrack") || entityMutationSource.includes("dynamic.manualKeyframeTracks =")) {
  throw new Error("Typed motion mutation must use applyManualKeyframeTrack and must not assign readonly manualKeyframeTracks.");
}
for (const marker of ['resultMode !== "full" && resultMode !== "receipt"', 'resultMode === "receipt"', "compactMutationPlan(plan)", "compactChangedEntities(appliedByIndex, patches)", "beforeFingerprint", "afterRollbackFingerprint"]) {
  if (!entityMutationSource.includes(marker)) throw new Error(`P1 compact mutation receipt source marker missing: ${marker}`);
}
for (const marker of ['resultMode: { type: "string", enum: ["full", "receipt"]', '"maxOperations", "resultMode"']) {
  if (!mcpSource.includes(marker)) throw new Error(`P1 compact mutation receipt MCP marker missing: ${marker}`);
}
const runtimeSource = readFileSync(resolve(root, "src/server/runtime.ts"), "utf8");
if (!runtimeSource.includes('resultMode is only supported by apply_entity_patch')) throw new Error("P1 resultMode runtime validation marker missing.");
const entityOperationsTestSource = readFileSync(resolve(root, "tests/plugin/entity-operations.test.ts"), "utf8");
for (const marker of ["contrastInputs", "applyManualKeyframeTrack", "Unsupported motion"]) {
  if (!entityOperationsTestSource.includes(marker)) throw new Error(`P0 regression test is missing marker: ${marker}`);
}
for (const marker of ["compact opt-in receipts", "compact rollback failure evidence", "beforeFingerprint", "afterRollbackFingerprint"]) {
  if (!entityOperationsTestSource.includes(marker)) throw new Error(`P1 compact receipt regression test is missing marker: ${marker}`);
}
for (const marker of ["planEntityPatchExecution", "executionOrder", "materializeLocalPatchRefs", "findSurvivingProducedEntities", "survivingProducedEntities"]) {
  if (!entityOperationsSource.includes(marker)) throw new Error(`P1-B transaction-local ref source marker missing: ${marker}`);
}
for (const marker of ['opRef: { type: "string"', "Transaction-local identity produced by create/clone or another explicitly typed producer", "Optional transaction-local output identity", "component_command:create_slot", "component_command:combine_variants", "Modeled multi-identity input edge"]) {
  if (!mcpSource.includes(marker)) throw new Error(`P1-B transaction-local ref MCP marker missing: ${marker}`);
}
const entityContractSource = readFileSync(resolve(root, "src/shared/entity-contract.ts"), "utf8");
for (const marker of ["planEntityPatchExecution", "duplicate opRef producer", "missing opRef producer", "dependency cycle", "entityKind mismatch"]) {
  if (!entityContractSource.includes(marker)) throw new Error(`P1-B dependency-plan contract marker missing: ${marker}`);
}
for (const marker of ["forward local-ref dependencies", "produced entity survives undo", "rollbackError", "local-root"]) {
  if (!entityOperationsTestSource.includes(marker)) throw new Error(`P1-B transaction-local ref regression test is missing marker: ${marker}`);
}
const entityContractTestSource = readFileSync(resolve(root, "tests/server/entity-contract.test.ts"), "utf8");
for (const marker of ["forward transaction-local refs", "invalid transaction-local ref graphs", "duplicate opRef", "dependency cycle"]) {
  if (!entityContractTestSource.includes(marker)) throw new Error(`P1-B shared contract regression test is missing marker: ${marker}`);
}
for (const marker of ["add_property", "edit_property", "delete_property", "create_slot", "reset_slot", "createSlot()", "resetSlot()", "limitViolations", "deletedComponentProperty", "componentPropertyKey"]) {
  if (!entityOperationsSource.includes(marker)) throw new Error(`P2-C1 component contract source marker missing: ${marker}`);
}
for (const marker of ["combine_variants", "combineAsVariants", "componentSetMemberCount", "componentSetMemberIds", "componentSetMembersTruncated", "members"] ) {
  if (!entityOperationsSource.includes(marker) && marker !== "members") throw new Error(`P2-C2 variant-set source marker missing: ${marker}`);
}
for (const marker of ["interface CombineVariantsPatchWire", "members: EntityRefWire[]", "component_command:combine_variants", "members[${index}]"]) {
  if (!entityContractSource.includes(marker)) throw new Error(`P2-C2 modeled member-edge contract marker missing: ${marker}`);
}
for (const marker of ["combine_variants", "members:", "componentSetMemberCount"]) {
  if (!entityOperationsTestSource.includes(marker)) throw new Error(`P2-C2 variant-set regression test marker missing: ${marker}`);
}
for (const marker of ["combine_variants", "members:", "buttonSet"]) {
  if (!entityContractTestSource.includes(marker)) throw new Error(`P2-C2 member dependency test marker missing: ${marker}`);
}
for (const marker of ["manages component property lifecycle", "creates a Slot as a transaction-local producer", "limitViolations", "reset_slot", 'propertyType: "SLOT"']) {
  if (!entityOperationsTestSource.includes(marker)) throw new Error(`P2-C1 component contract regression test is missing marker: ${marker}`);
}
for (const marker of ["typed component Slot producers", 'command: "create_slot"', 'opRef: "content"']) {
  if (!entityContractTestSource.includes(marker)) throw new Error(`P2-C1 Slot producer contract test is missing marker: ${marker}`);
}

const productionArm = (valueEvals.comparisonArms ?? []).find((item) => item.id === "CONTROLMUX_LOCAL_CORE");
if (!productionArm || !String(productionArm.description ?? "").includes("target production posture")) {
  throw new Error("Skill value eval must identify CONTROLMUX_LOCAL_CORE as the target production posture.");
}
if ((valueEvals.comparisonArms ?? []).some((item) => item.id === "CONTROLMUX_HYBRID" && String(item.description ?? "").includes("target production posture"))) {
  throw new Error("Hybrid/provider delegation must not be encoded as the target production posture.");
}

console.log(`capability registry OK: package/plugin manifests aligned at ${packageManifest.version}; required MCP files present; ${ids.length} Skills, progressive work graph, runtime SDK, typed query/apply kernel, plan-aware telemetry, Reuse Registry, 5-tool runtime/egress surface, lifecycle packets, and frozen behavioral/value eval boundaries aligned`);

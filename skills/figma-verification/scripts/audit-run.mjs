#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2] || "help";
const input = process.argv[3];
const output = process.argv[4];
const STATES = new Set(["PASS", "FAIL", "NOT_RUN", "INCONCLUSIVE", "MISSING", "BLOCKED"]);

function load(path) {
  if (!path) throw new Error("Expected a JSON path.");
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function validateProfile(profile) {
  const errors = [];
  if (!profile || profile.kind !== "AuditProfile" || profile.schemaVersion !== 1) errors.push("profile.kind must be AuditProfile and schemaVersion must be 1");
  if (profile?.status !== "PROFILE_ONLY") errors.push("AuditProfile status must be PROFILE_ONLY");
  if (containsPass(profile)) errors.push("AuditProfile/checklist cannot contain PASS verdicts; execute it into an AuditReport first");
  return errors;
}

function validateUpgradeRun(run) {
  const errors = [];
  if (!run || run.kind !== "UpgradeRun" || run.schemaVersion !== 1) errors.push("run.kind must be UpgradeRun and schemaVersion must be 1");
  if (!run?.target?.fileName || !run?.target?.bundleRevision || !run?.target?.snapshotId || !run?.target?.observedAt) errors.push("UpgradeRun target requires fileName, bundleRevision, snapshotId and observedAt");
  if (!run?.planHash || !Array.isArray(run?.operations) || run.operations.length > 100 || !Array.isArray(run?.changedEntities)) errors.push("UpgradeRun requires planHash, at most 100 operations and changedEntities");
  if (!["not_needed", "verified", "unverified"].includes(run?.rollbackState)) errors.push("UpgradeRun rollbackState is invalid");
  if (!run?.postChangeVerification || typeof run.postChangeVerification !== "object") errors.push("UpgradeRun requires postChangeVerification");
  return errors;
}

function containsPass(value) {
  if (Array.isArray(value)) return value.some(containsPass);
  if (!value || typeof value !== "object") return value === "PASS";
  return Object.entries(value).some(([key, item]) => (key === "status" || key === "boundedVerdict" || key === "verdict") && item === "PASS" || containsPass(item));
}

function validateReport(report, baseDir = process.cwd()) {
  const errors = [];
  if (!report || report.kind !== "AuditReport" || report.schemaVersion !== 1) errors.push("report.kind must be AuditReport and schemaVersion must be 1");
  if (!report.target?.fileName || !report.target?.bundleRevision || !report.target?.snapshotId || !report.target?.observedAt) errors.push("target requires fileName, bundleRevision, snapshotId and observedAt");
  if (!Array.isArray(report.expectedTruth) || report.expectedTruth.some((item) => !item?.id || !item?.source)) errors.push("expectedTruth entries require id and source");
  if (!Array.isArray(report.claims)) errors.push("claims must be an array");
  const claims = Array.isArray(report.claims) ? report.claims : [];
  const claimIds = new Set();
  for (const claim of claims) {
    if (!claim?.claimId || claimIds.has(claim.claimId)) errors.push(`claimId is missing or duplicated: ${claim?.claimId || "unknown"}`);
    claimIds.add(claim?.claimId);
    if (!STATES.has(claim?.status)) errors.push(`${claim?.claimId || "claim"} has an invalid status; PARTIAL is not allowed`);
    if (!["REQUIRED", "OPTIONAL", "OUT_OF_SCOPE"].includes(claim?.applicability)) errors.push(`${claim?.claimId || "claim"} has invalid applicability`);
    if (!Array.isArray(claim?.evidenceRefs)) errors.push(`${claim?.claimId || "claim"} must contain evidenceRefs`);
    if (claim?.status === "PASS" && (!claim.evidenceRefs?.length || claim.evidenceRefs.some((ref) => !ref?.tool || !ref?.observedAt || !ref?.snapshotId || ref.snapshotId !== report.target?.snapshotId))) errors.push(`${claim.claimId} PASS requires tool, observedAt and evidence snapshotId matching the report target`);
    if (claim?.status === "BLOCKED" && (!claim.finding?.providerOperation || !claim.finding?.providerError || !claim.finding?.unlockCondition || !claim.finding?.reasonCode || !claim.finding?.lifecycleState)) errors.push(`${claim?.claimId || "claim"} BLOCKED requires exact provider operation/error, reasonCode, lifecycleState and unlockCondition`);
    const refs = claim?.evidenceRefs || [];
    if (["prototype", "interaction", "motion", "temporal", "accessibility", "runtime"].some((dimension) => String(claim?.dimension || "").toLowerCase().includes(dimension)) && refs.some((ref) => ref?.kind === "screenshot" || ref?.mediaType?.startsWith?.("image/"))) {
      errors.push(`${claim.claimId} screenshot evidence cannot prove prototype, Motion, runtime accessibility or playback behavior`);
    }
    if (String(claim?.dimension || "").toLowerCase().includes("reuse")) {
      const scopes = new Set(refs.map((ref) => ref?.scope).filter(Boolean));
      if (scopes.has("local") && scopes.has("cross_file")) errors.push(`${claim.claimId} mixes local component reuse evidence with cross-file library distribution evidence`);
    }
  }
  const dimensions = report.dimensions && typeof report.dimensions === "object" ? Object.values(report.dimensions) : [];
  if (dimensions.some((state) => !STATES.has(state))) errors.push("dimensions contain an invalid status");
  if (!STATES.has(report.boundedVerdict)) errors.push("boundedVerdict is invalid");
  const unresolvedRequired = claims.filter((claim) => claim.required === true && claim.applicability === "REQUIRED" && claim.status !== "PASS");
  if (report.boundedVerdict === "PASS" && unresolvedRequired.length) errors.push(`boundedVerdict PASS hides unresolved required claims: ${unresolvedRequired.map((claim) => claim.claimId).join(", ")}`);
  for (const claim of claims) for (const ref of claim.evidenceRefs || []) {
    if (ref.path && !existsSync(resolve(baseDir, ref.path))) errors.push(`${claim.claimId} evidence path does not exist: ${ref.path}`);
    if (ref.path && ref.sha256 && existsSync(resolve(baseDir, ref.path)) && hashFile(resolve(baseDir, ref.path)) !== ref.sha256) errors.push(`${claim.claimId} evidence hash does not match: ${ref.path}`);
  }
  return errors;
}

if (command === "init") {
  const template = fileURLToPath(new URL("../templates/audit-plan.json", import.meta.url));
  const target = resolve(output || "audit-plan.json");
  writeFileSync(target, readFileSync(template));
  console.log(JSON.stringify({ status: "INITIALIZED", path: target }, null, 2));
} else if (command === "validate") {
  const report = load(input);
  const errors = report?.kind === "AuditProfile" ? validateProfile(report) : report?.kind === "UpgradeRun" ? validateUpgradeRun(report) : validateReport(report, dirname(resolve(input)));
  console.log(JSON.stringify({ status: errors.length ? "FAIL" : "PASS", errors, sha256: hashFile(input) }, null, 2));
  if (errors.length) process.exitCode = 1;
} else if (command === "render") {
  const report = load(input);
  const lines = [`# ${report.kind}`, ``, `- Target: ${report.target?.fileName || "unknown"}`, `- Snapshot: ${report.target?.snapshotId || "unknown"}`, `- Bundle: ${report.target?.bundleRevision || "unknown"}`, `- Verdict: ${report.boundedVerdict || "NOT_RUN"}`, ``];
  for (const claim of report.claims || []) lines.push(`- ${claim.claimId}: ${claim.status} (${claim.dimension})`);
  const rendered = lines.join("\n");
  if (output) writeFileSync(resolve(output), rendered); else console.log(rendered);
} else {
  console.log("Usage: audit-run.mjs init [output] | validate <report.json> | render <report.json> [output.md]");
}

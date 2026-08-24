import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../skills/figma-verification/scripts/audit-run.mjs", import.meta.url));

describe("strict audit runner", () => {
  it("rejects a PASS without exact evidence references", () => {
    const dir = mkdtempSync(join(tmpdir(), "figma-audit-"));
    const report = join(dir, "report.json");
    writeFileSync(report, JSON.stringify({ schemaVersion: 1, kind: "AuditReport", target: { fileName: "Untitled", bundleRevision: "b", snapshotId: "s", observedAt: 1 }, expectedTruth: [{ id: "x", source: "test" }], claims: [{ claimId: "x", dimension: "structure", applicability: "REQUIRED", required: true, status: "PASS", evidenceRefs: [] }], dimensions: { structure: "PASS" }, boundedVerdict: "PASS" }));
    expect(() => execFileSync(process.execPath, [script, "validate", report], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });

  it("accepts a bounded report with evidence and unresolved optional work", () => {
    const dir = mkdtempSync(join(tmpdir(), "figma-audit-"));
    const evidence = join(dir, "evidence.json");
    const report = join(dir, "report.json");
    writeFileSync(evidence, "{}");
    writeFileSync(report, JSON.stringify({ schemaVersion: 1, kind: "AuditReport", target: { fileName: "Untitled", bundleRevision: "b", snapshotId: "s", observedAt: 1 }, expectedTruth: [{ id: "x", source: "test" }], claims: [{ claimId: "x", dimension: "structure", applicability: "REQUIRED", required: true, status: "PASS", evidenceRefs: [{ tool: "figma_query", observedAt: 1, snapshotId: "s", path: evidence }] }, { claimId: "y", dimension: "visual", applicability: "OPTIONAL", required: false, status: "NOT_RUN", evidenceRefs: [] }], dimensions: { structure: "PASS", visual: "NOT_RUN" }, boundedVerdict: "PASS" }));
    const output = execFileSync(process.execPath, [script, "validate", report], { encoding: "utf8" });
    expect(JSON.parse(output).status).toBe("PASS");
  });

  it("rejects checklist verdicts and screenshot-only runtime claims", () => {
    const dir = mkdtempSync(join(tmpdir(), "figma-audit-profile-"));
    const profile = join(dir, "profile.json");
    writeFileSync(profile, JSON.stringify({ schemaVersion: 1, kind: "AuditProfile", status: "PROFILE_ONLY", claims: [{ status: "PASS" }] }));
    expect(() => execFileSync(process.execPath, [script, "validate", profile], { encoding: "utf8", stdio: "pipe" })).toThrow();

    const evidence = join(dir, "shot.png");
    const report = join(dir, "runtime.json");
    writeFileSync(evidence, "not-a-real-png");
    writeFileSync(report, JSON.stringify({ schemaVersion: 1, kind: "AuditReport", target: { fileName: "Untitled", bundleRevision: "b", snapshotId: "s", observedAt: 1 }, expectedTruth: [{ id: "x", source: "test" }], claims: [{ claimId: "x", dimension: "prototype-runtime", applicability: "REQUIRED", required: true, status: "PASS", evidenceRefs: [{ tool: "figma_export", observedAt: 1, snapshotId: "s", path: evidence, kind: "screenshot" }] }], dimensions: { "prototype-runtime": "PASS" }, boundedVerdict: "PASS" }));
    expect(() => execFileSync(process.execPath, [script, "validate", report], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });
});

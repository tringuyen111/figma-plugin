import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDoctorReport, formatDoctorReport, REQUIRED_FIGMA_SKILLS } from "../../src/server/doctor.js";

function readyFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "figma-plugin-doctor-"));
  for (const dir of ["dist/server", "plugin", ".codex-plugin", ".claude-plugin", ...REQUIRED_FIGMA_SKILLS.map((name) => `skills/${name}`)]) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, "dist/server/index.js"), "// bundle");
  writeFileSync(join(root, "plugin/code.js"), "// plugin");
  writeFileSync(join(root, "plugin/ui.html"), "<div>Figma Plugin</div>");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "figma-plugin", version: "0.7.0" }));
  writeFileSync(join(root, ".codex-plugin/plugin.json"), JSON.stringify({ name: "figma-plugin", version: "0.7.0" }));
  writeFileSync(join(root, ".claude-plugin/plugin.json"), JSON.stringify({ name: "figma-plugin", version: "0.7.0" }));
  writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { "figma-plugin": { command: "node", args: ["./dist/server/index.js"] } } }));
  for (const name of REQUIRED_FIGMA_SKILLS) writeFileSync(join(root, `skills/${name}/SKILL.md`), `# ${name}`);
  writeFileSync(join(root, "plugin/manifest.json"), JSON.stringify({
    name: "Figma Plugin",
    id: "figma-plugin",
    main: "code.js",
    ui: "ui.html",
  }));
  return root;
}

describe("Figma Plugin doctor", () => {
  it("reports the exact Figma manifest and continuation steps", () => {
    const report = buildDoctorReport(readyFixture());
    expect(report.status).toBe("READY");
    expect(report.manifestPath).toMatch(/plugin[\\/]manifest\.json$/);
    expect(report.userSteps.join("\n")).toContain("Import plugin from manifest");
    expect(report.agentSteps.join("\n")).toContain("figma_status");
    expect(formatDoctorReport(report)).toContain("Agent continuation:");
    expect(report.checks.find((check) => check.id === "figma-provider-evidence")?.status).toBe("warn");
    expect(report.checks.find((check) => check.id === "release-version-alignment")?.status).toBe("ok");
  });

  it("requires the complete Figma capability topology", () => {
    const root = readyFixture();
    const missing = join(root, "skills/figma-motion/SKILL.md");
    unlinkSync(missing);
    const report = buildDoctorReport(root);
    expect(report.status).toBe("ACTION_REQUIRED");
    expect(report.checks.find((check) => check.id === "figma-skills")?.detail).toContain("figma-motion");
  });

  it("fails clearly when the Figma plugin output is incomplete", () => {
    const root = readyFixture();
    writeFileSync(join(root, "plugin/manifest.json"), JSON.stringify({
      name: "Figma Plugin",
      id: "figma-plugin",
      main: "missing.js",
      ui: "ui.html",
    }));
    const report = buildDoctorReport(root);
    expect(report.status).toBe("ACTION_REQUIRED");
    expect(report.checks.find((check) => check.id === "figma-manifest")?.status).toBe("fail");
  });

  it("fails when a required plugin package file is missing", () => {
    const root = readyFixture();
    unlinkSync(join(root, ".mcp.json"));
    const report = buildDoctorReport(root);
    expect(report.status).toBe("ACTION_REQUIRED");
    expect(report.checks.find((check) => check.id === "plugin-package-files")?.detail).toContain(".mcp.json");
  });

  it("fails when a plugin manifest version drifts from package.json", () => {
    const root = readyFixture();
    writeFileSync(join(root, ".codex-plugin/plugin.json"), JSON.stringify({ name: "figma-plugin", version: "0.5.6" }));
    const report = buildDoctorReport(root);
    expect(report.status).toBe("ACTION_REQUIRED");
    expect(report.checks.find((check) => check.id === "release-version-alignment")?.detail).toContain(".codex-plugin/plugin.json=0.5.6");
  });

  it("accepts the official Codex cachebuster suffix for the Codex manifest", () => {
    const root = readyFixture();
    writeFileSync(
      join(root, ".codex-plugin/plugin.json"),
      JSON.stringify({ name: "figma-plugin", version: "0.7.0+codex.local-20260824-080809" }),
    );
    const report = buildDoctorReport(root);
    expect(report.status).toBe("READY");
    expect(report.checks.find((check) => check.id === "release-version-alignment")?.detail).toContain("Codex cachebuster");
  });

  it("rejects non-Codex build metadata drift in the Codex manifest", () => {
    const root = readyFixture();
    writeFileSync(
      join(root, ".codex-plugin/plugin.json"),
      JSON.stringify({ name: "figma-plugin", version: "0.7.0+other.local" }),
    );
    const report = buildDoctorReport(root);
    expect(report.status).toBe("ACTION_REQUIRED");
    expect(report.checks.find((check) => check.id === "release-version-alignment")?.detail).toContain("0.7.0+other.local");
  });

  it("fails when aligned manifests are stale relative to the running candidate", () => {
    const root = readyFixture();
    for (const relativePath of ["package.json", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]) {
      const path = join(root, relativePath);
      writeFileSync(path, JSON.stringify({ name: "figma-plugin", version: "0.6.0" }));
    }
    const report = buildDoctorReport(root);
    expect(report.status).toBe("ACTION_REQUIRED");
    expect(report.checks.find((check) => check.id === "release-version-alignment")?.detail).toContain("expected running candidate v0.7.0");
  });
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "./version.js";
import { FIGMA_SKILL_IDS } from "../capabilities/skill-registry.js";
import { FIGMA_PROVIDER_EVIDENCE } from "../capabilities/provider-evidence.js";

export type DoctorCheckStatus = "ok" | "warn" | "fail";

export const REQUIRED_FIGMA_SKILLS = FIGMA_SKILL_IDS;

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  detail: string;
}

export interface DoctorReport {
  status: "READY" | "ACTION_REQUIRED";
  version: string;
  projectRoot: string;
  manifestPath: string;
  checks: DoctorCheck[];
  userSteps: string[];
  agentSteps: string[];
}

interface ManifestShape {
  name?: unknown;
  id?: unknown;
  main?: unknown;
  ui?: unknown;
}

interface PackageShape {
  version?: unknown;
}

export const REQUIRED_PLUGIN_PACKAGE_FILES = [
  "package.json",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".mcp.json",
] as const;

export function defaultProjectRoot(): string {
  return fileURLToPath(new URL("../../", import.meta.url));
}

export function buildDoctorReport(projectRoot = defaultProjectRoot()): DoctorReport {
  const root = resolve(projectRoot);
  const manifestPath = resolve(root, "plugin/manifest.json");
  const checks: DoctorCheck[] = [];

  checks.push(checkNodeVersion());
  checks.push(checkFile("server-bundle", "MCP runtime bundle", resolve(root, "dist/server/index.js")));
  checks.push(checkFile("plugin-ui", "Figma plugin UI", resolve(root, "plugin/ui.html")));
  checks.push(checkPluginPackageFiles(root));
  checks.push(checkReleaseVersionAlignment(root));
  checks.push(checkSkillTopology(root));
  checks.push(checkProviderEvidence());
  checks.push(checkManifest(root, manifestPath));

  const status = checks.some((check) => check.status === "fail") ? "ACTION_REQUIRED" : "READY";
  return {
    status,
    version: VERSION,
    projectRoot: root,
    manifestPath,
    checks,
    userSteps: [
      "Open Figma Desktop and open the file/window you want the agent to control.",
      "Open Plugins > Development > Import plugin from manifest...",
      `Choose this manifest: ${manifestPath}`,
      "Run Figma Plugin in every Figma window/tab that should be available to the agent.",
      "Keep the Figma Plugin panel open while the agent is working.",
    ],
    agentSteps: [
      "Do not wait silently when setup is incomplete: report the first failed doctor check and the exact user step that resolves it.",
      "Ensure this package is registered as the figma-plugin MCP server in the active agent client, then start a fresh agent session when the client requires plugin reload.",
      "After the MCP runtime is attached, call figma_status before the first Figma operation.",
      "If figma_status reports no connected instance, guide the user through the Figma manifest/import/run steps above, then retry figma_status.",
      "When several Figma windows are online, make the target explicit before editing by binding/selecting the intended instance.",
    ],
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    `Figma Plugin doctor v${report.version}`,
    `Status: ${report.status}`,
    `Project: ${report.projectRoot}`,
    `Manifest: ${report.manifestPath}`,
    "",
    "Checks:",
  ];
  for (const check of report.checks) {
    const marker = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "FAIL";
    lines.push(`- [${marker}] ${check.label}: ${check.detail}`);
  }
  lines.push("", "Figma steps:");
  report.userSteps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  lines.push("", "Agent continuation:");
  report.agentSteps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  return lines.join("\n");
}

function checkNodeVersion(): DoctorCheck {
  const major = Number(process.versions.node.split(".")[0] ?? "0");
  return major >= 18
    ? { id: "node", label: "Node.js", status: "ok", detail: `v${process.versions.node}` }
    : { id: "node", label: "Node.js", status: "fail", detail: `v${process.versions.node}; Node.js 18+ is required.` };
}

function checkFile(id: string, label: string, path: string): DoctorCheck {
  return existsSync(path)
    ? { id, label, status: "ok", detail: path }
    : { id, label, status: "fail", detail: `Missing: ${path}` };
}

function checkPluginPackageFiles(root: string): DoctorCheck {
  const missing = REQUIRED_PLUGIN_PACKAGE_FILES.filter((path) => !existsSync(resolve(root, path)));
  return missing.length === 0
    ? {
        id: "plugin-package-files",
        label: "Plugin/MCP package files",
        status: "ok",
        detail: `${REQUIRED_PLUGIN_PACKAGE_FILES.length} required files present`,
      }
    : {
        id: "plugin-package-files",
        label: "Plugin/MCP package files",
        status: "fail",
        detail: `Missing: ${missing.join(", ")}`,
      };
}

function checkReleaseVersionAlignment(root: string): DoctorCheck {
  const versionFiles = ["package.json", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json"] as const;
  const versions: Array<{ path: string; version: string }> = [];

  for (const relativePath of versionFiles) {
    const path = resolve(root, relativePath);
    if (!existsSync(path)) {
      return {
        id: "release-version-alignment",
        label: "Package/manifest versions",
        status: "fail",
        detail: `Cannot compare versions; missing: ${relativePath}`,
      };
    }
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as PackageShape;
      if (typeof parsed.version !== "string" || parsed.version.length === 0) {
        return {
          id: "release-version-alignment",
          label: "Package/manifest versions",
          status: "fail",
          detail: `Missing string version in ${relativePath}`,
        };
      }
      versions.push({ path: relativePath, version: parsed.version });
    } catch (error) {
      return {
        id: "release-version-alignment",
        label: "Package/manifest versions",
        status: "fail",
        detail: `Invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const packageVersion = versions[0]!.version;
  const packageBaseVersion = packageVersion.split("+", 1)[0]!;
  const codexCachebusterPattern = new RegExp(`^${escapeRegExp(packageBaseVersion)}\\+codex\\.[A-Za-z0-9.-]+$`);
  const mismatches = versions.filter((item) =>
    item.version !== packageVersion
    && !(item.path === ".codex-plugin/plugin.json" && codexCachebusterPattern.test(item.version))
  );
  if (mismatches.length > 0) {
    return {
      id: "release-version-alignment",
      label: "Package/manifest versions",
      status: "fail",
      detail: versions.map((item) => `${item.path}=${item.version}`).join("; "),
    };
  }

  return packageVersion === VERSION
    ? {
        id: "release-version-alignment",
        label: "Package/manifest versions",
        status: "ok",
        detail: versions[1]!.version === packageVersion
          ? `All release manifests match package.json v${packageVersion}`
          : `Release manifests match package.json v${packageVersion}; Codex cachebuster ${versions[1]!.version} is active`,
      }
    : {
        id: "release-version-alignment",
        label: "Package/manifest versions",
        status: "fail",
        detail: `All release manifests are aligned at stale v${packageVersion}; expected running candidate v${VERSION}. Reload/reinstall the candidate before using the companion.`,
      };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function checkSkillTopology(root: string): DoctorCheck {
  const missing = REQUIRED_FIGMA_SKILLS.filter((name) => !existsSync(resolve(root, "skills", name, "SKILL.md")));
  return missing.length === 0
    ? { id: "figma-skills", label: "Figma capability Skills", status: "ok", detail: `${REQUIRED_FIGMA_SKILLS.length} Skills present` }
    : { id: "figma-skills", label: "Figma capability Skills", status: "fail", detail: `Missing: ${missing.join(", ")}` };
}


function checkProviderEvidence(): DoctorCheck {
  const surfaceCount = FIGMA_PROVIDER_EVIDENCE.surfaces.length;
  return {
    id: "figma-provider-evidence",
    label: "Figma provider evidence",
    status: "warn",
    detail: `${surfaceCount} observed provider surfaces from ${FIGMA_PROVIDER_EVIDENCE.observedAt}; live host schema revalidation is still required before depending on provider-specific tools.`,
  };
}
function checkManifest(root: string, manifestPath: string): DoctorCheck {
  if (!existsSync(manifestPath)) {
    return { id: "figma-manifest", label: "Figma manifest", status: "fail", detail: `Missing: ${manifestPath}` };
  }

  let manifest: ManifestShape;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestShape;
  } catch (error) {
    return {
      id: "figma-manifest",
      label: "Figma manifest",
      status: "fail",
      detail: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (manifest.name !== "Figma Plugin" || manifest.id !== "figma-plugin") {
    return {
      id: "figma-manifest",
      label: "Figma manifest",
      status: "fail",
      detail: "Manifest identity must be Figma Plugin / figma-plugin.",
    };
  }
  if (typeof manifest.main !== "string" || typeof manifest.ui !== "string") {
    return {
      id: "figma-manifest",
      label: "Figma manifest",
      status: "fail",
      detail: "Manifest must declare main and ui files.",
    };
  }

  const mainPath = resolve(root, "plugin", manifest.main);
  const uiPath = resolve(root, "plugin", manifest.ui);
  if (!existsSync(mainPath) || !existsSync(uiPath)) {
    return {
      id: "figma-manifest",
      label: "Figma manifest",
      status: "fail",
      detail: `Manifest references missing output: ${!existsSync(mainPath) ? mainPath : uiPath}`,
    };
  }

  return { id: "figma-manifest", label: "Figma manifest", status: "ok", detail: manifestPath };
}

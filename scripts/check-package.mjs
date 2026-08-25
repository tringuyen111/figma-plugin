import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmArgs = ["pack", "--dry-run", "--ignore-scripts", "--json"];
const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const args = npmCli ? [npmCli, ...npmArgs] : npmArgs;
const result = spawnSync(command, args, {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
  shell: !npmCli && process.platform === "win32",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`npm pack --dry-run failed (${result.status}): ${result.stderr || result.stdout}`);
}

const reports = JSON.parse(result.stdout);
const report = Array.isArray(reports) ? reports[0] : null;
if (!report || !Array.isArray(report.files)) throw new Error("npm pack did not return a package file inventory.");

const files = report.files.map((entry) => String(entry.path).replaceAll("\\", "/"));
const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".mcp.json",
  "dist/server/index.js",
  "plugin/manifest.json",
  "plugin/code.js",
  "plugin/ui.html",
  "docs/README.md",
  "docs/DEVELOPMENT.md",
  "skills/figma-native/SKILL.md",
];
for (const path of required) {
  if (!files.includes(path)) throw new Error(`Package is missing required file: ${path}`);
}

const forbiddenPrefixes = ["src/", "scripts/", "tests/", "output/", "coverage/", "node_modules/", ".playwright-cli/", "work/"];
const forbidden = files.filter((path) =>
  forbiddenPrefixes.some((prefix) => path.startsWith(prefix))
  || path.endsWith(".map")
  || path.endsWith(".tgz"),
);
if (forbidden.length > 0) throw new Error(`Package contains source/build residue: ${forbidden.join(", ")}`);

console.log(`package clean: ${report.name}@${report.version}; ${files.length} files; ${report.size} bytes`);

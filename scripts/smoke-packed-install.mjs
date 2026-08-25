import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { RuntimeClient, assert } from "./lib/runtime-client.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "figma-plugin-packed-install-"));
const consumer = join(directory, "consumer");
let runtime;

try {
  const packResult = runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", directory], root);
  const packReports = JSON.parse(packResult.stdout);
  const packReport = Array.isArray(packReports) ? packReports[0] : null;
  assert(packReport && typeof packReport.filename === "string", "npm pack did not return a tarball filename.");
  const archive = join(directory, packReport.filename);
  await access(archive);

  await mkdir(consumer, { recursive: true });
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({ name: "figma-plugin-install-smoke", private: true }, null, 2)}\n`, "utf8");
  runNpm(["install", archive, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], consumer);

  const installedRoot = join(consumer, "node_modules", "figma-plugin");
  const serverPath = join(installedRoot, "dist", "server", "index.js");
  const [packageManifest, codexManifest] = await Promise.all([
    readJson(join(installedRoot, "package.json")),
    readJson(join(installedRoot, ".codex-plugin", "plugin.json")),
    access(serverPath),
    access(join(installedRoot, "plugin", "manifest.json")),
    access(join(installedRoot, "plugin", "code.js")),
    access(join(installedRoot, "plugin", "ui.html")),
  ]);
  assert(packageManifest.name === "figma-plugin", "Installed package name drifted.");
  assert(packageManifest.version === codexManifest.version, "Installed npm/Codex package versions do not match.");

  const doctor = run(process.execPath, [serverPath, "doctor", "--json"], installedRoot);
  const doctorReport = JSON.parse(doctor.stdout);
  assert(doctorReport.status === "READY", `Installed-package doctor returned ${String(doctorReport.status)}.`);
  assert(doctorReport.projectRoot === installedRoot, "Doctor did not bind the fresh installed-package root.");

  runtime = new RuntimeClient({ name: "figma-plugin-packed-install-smoke", serverPath, cwd: installedRoot });
  await runtime.connect();
  const listed = await runtime.listTools();
  const tools = listed.tools.map((tool) => tool.name);
  assert(JSON.stringify(tools) === JSON.stringify(["figma_status", "figma_query", "figma_apply", "figma_exec", "figma_export"]), `Unexpected installed-package tools: ${tools.join(", ")}`);
  const status = await runtime.status(false);
  assert(typeof status.pluginConnected === "boolean", "Installed package returned an invalid companion state.");

  process.stdout.write(`${JSON.stringify({
    packedInstall: "PASS",
    package: `${packageManifest.name}@${packageManifest.version}`,
    files: packReport.entryCount,
    size: packReport.size,
    tools,
    doctor: doctorReport.status,
    pluginConnected: status.pluginConnected,
  })}\n`);
} finally {
  await runtime?.close();
  await rm(directory, { recursive: true, force: true });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  return npmCli
    ? run(process.execPath, [npmCli, ...args], cwd)
    : run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd, process.platform === "win32");
}

function run(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true, shell });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result;
}

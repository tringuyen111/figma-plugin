/**
 * Build script:
 *  - server:  src/server/index.ts  → dist/server/index.js (Node ESM bundle)
 *  - plugin:  src/plugin/main.ts   → plugin/code.js (IIFE, target es2017 for the Figma sandbox)
 * The package.json version is injected into both bundles as __VERSION__.
 */
import { build, context } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync, watchFile } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUi } from "./build-ui.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const watch = process.argv.includes("--watch");
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
buildUi();

function sourceFiles(directory) {
  const root = new URL(`../${directory}/`, import.meta.url);
  const walk = (url) => readdirSync(url, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
    return entry.isDirectory() ? walk(child) : [child];
  });
  return walk(root).sort((left, right) => String(left).localeCompare(String(right)));
}

const revisionInputs = [
  new URL("../package.json", import.meta.url),
  new URL("../package-lock.json", import.meta.url),
  new URL("../THIRD_PARTY_NOTICES.md", import.meta.url),
  new URL("../plugin/manifest.json", import.meta.url),
  ...sourceFiles("src"),
];
const revisionHash = createHash("sha256");
for (const url of revisionInputs) {
  const path = relative(process.cwd(), fileURLToPath(url));
  revisionHash.update(path.replaceAll("/", "\\"));
  revisionHash.update("\0");
  revisionHash.update(readFileSync(url));
  revisionHash.update("\0");
}
const bundleRevision = revisionHash.digest("hex").slice(0, 16);

const common = {
  bundle: true,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __BUNDLE_REVISION__: JSON.stringify(bundleRevision),
  },
  logLevel: "info",
  minify: true,
  sourcemap: true,
};

const serverConfig = {
  ...common,
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server/index.js",
  platform: "node",
  format: "esm",
  target: "node18",
  metafile: true,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  // Codex plugin installation caches packaged files without running npm install.
  // Bundle runtime dependencies so the installed MCP entrypoint is self-contained.
};

function validateBundledRuntimeNotices(metafile) {
  const packages = new Set();
  for (const input of Object.keys(metafile?.inputs ?? {})) {
    const normalized = input.replaceAll("\\", "/");
    const marker = "node_modules/";
    const index = normalized.lastIndexOf(marker);
    if (index < 0) continue;
    const parts = normalized.slice(index + marker.length).split("/");
    packages.add(parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
  }
  if (packages.size === 0) throw new Error("Self-contained server bundle contains no inspectable runtime dependencies.");
  const notices = readFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
  for (const name of [...packages].sort()) {
    if (!notices.includes(`## ${name}@`)) throw new Error(`THIRD_PARTY_NOTICES.md is missing bundled runtime package ${name}.`);
  }
  return [...packages].sort();
}

const pluginConfig = {
  ...common,
  entryPoints: ["src/plugin/main.ts"],
  outfile: "plugin/code.js",
  platform: "browser",
  format: "iife",
  target: "es2017",
};

if (watch) {
  const [s, p] = await Promise.all([context(serverConfig), context(pluginConfig)]);
  await Promise.all([s.watch(), p.watch()]);
  const uiFiles = [
    "src/ui/template.html",
    "src/ui/styles.css",
    ...readdirSync(new URL("../src/ui/script/", import.meta.url))
      .filter((name) => name.endsWith(".js"))
      .sort()
      .map((name) => `src/ui/script/${name}`),
  ];
  for (const file of uiFiles) {
    watchFile(file, { interval: 250 }, () => {
      try { buildUi(); console.log(`rebuilt ${file}`); }
      catch (error) { console.error(error); }
    });
  }
  console.log("watching…");
} else {
  const [serverResult] = await Promise.all([build(serverConfig), build(pluginConfig)]);
  const bundledPackages = validateBundledRuntimeNotices(serverResult.metafile);
  console.log(`bundle revision ${bundleRevision}; third-party notices ${bundledPackages.length}/${bundledPackages.length}`);
}

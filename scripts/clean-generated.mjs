import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const checkOnly = process.argv.includes("--check");
const includeCaches = process.argv.includes("--all");

const generated = [
  "dist",
  "plugin/code.js",
  "plugin/code.js.map",
  "plugin/ui.html",
  "output",
  "coverage",
];
const caches = ["node_modules", ".playwright-cli"];
const archives = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^figma-plugin-.*\.tgz$/i.test(entry.name))
  .map((entry) => entry.name);
const targets = [...generated, ...archives, ...(includeCaches ? caches : [])];
const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;

function targetPath(relativePath) {
  const absolute = resolve(root, relativePath);
  if (absolute === root || !absolute.startsWith(rootPrefix)) {
    throw new Error(`Refusing cleanup outside plugin root: ${relativePath}`);
  }
  return absolute;
}

const present = targets.filter((relativePath) => existsSync(targetPath(relativePath)));
if (checkOnly) {
  if (present.length > 0) {
    throw new Error(`Generated or local-only paths remain: ${present.join(", ")}`);
  }
  console.log(`source tree clean (${includeCaches ? "generated outputs and caches" : "generated outputs"})`);
  process.exit(0);
}

for (const relativePath of present) {
  rmSync(targetPath(relativePath), { recursive: true, force: true });
}

console.log(`cleaned ${present.length} path(s)${present.length ? `: ${present.join(", ")}` : ""}`);

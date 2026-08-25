import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const docsRoot = resolve(root, "docs");
const docNames = readdirSync(docsRoot)
  .filter((name) => name.endsWith(".md"))
  .sort();
const index = readFileSync(resolve(docsRoot, "README.md"), "utf8");

for (const name of docNames) {
  if (name !== "README.md" && !index.includes(`\`${name}\``)) {
    throw new Error(`docs/README.md does not index ${name}`);
  }
}

const markdownPaths = [resolve(root, "README.md"), ...docNames.map((name) => resolve(docsRoot, name))];
for (const path of markdownPaths) {
  const source = readFileSync(path, "utf8");
  const legacyVersions = [...source.matchAll(/\b0\.[0-6]\.\d+\b/g)].map((match) => match[0]);
  if (legacyVersions.length > 0) {
    throw new Error(`${path} contains superseded release narrative: ${[...new Set(legacyVersions)].join(", ")}`);
  }
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1]?.trim().split(/\s+["']/)[0] ?? "";
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const relativePath = decodeURIComponent(target.split("#")[0] ?? "");
    if (!relativePath || !existsSync(resolve(dirname(path), relativePath))) {
      throw new Error(`${path} contains a broken local link: ${target}`);
    }
  }
}

console.log(`docs clean: ${markdownPaths.length} Markdown files indexed; local links valid; no superseded release narrative`);

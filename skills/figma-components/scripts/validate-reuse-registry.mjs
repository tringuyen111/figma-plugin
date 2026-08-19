import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const IDENTITY = new Set(["LOCAL_VERIFIED", "LIBRARY_DISCOVERED", "LIBRARY_IMPORTED_VERIFIED", "STALE", "MISSING", "NOT_RUN"]);
const EVIDENCE = new Set(["PASS", "FAIL", "NOT_RUN", "INCONCLUSIVE", "MISSING", "BLOCKED"]);
const LINK = new Set(["LINKED", "DETACHED", "UNKNOWN"]);
const ID = /^[a-z0-9][a-z0-9._:/-]{0,159}$/;

export function validateReuseRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return ["registry must be an object"];
  if (registry.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (typeof registry.registryId !== "string" || !ID.test(registry.registryId)) errors.push("registryId is invalid");
  if (!registry.scope || !["local-file", "published-library", "mixed"].includes(registry.scope.kind)) errors.push("scope.kind is invalid");
  if (typeof registry.scope?.sourceFileName !== "string" || !registry.scope.sourceFileName) errors.push("scope.sourceFileName is required");
  if (!Array.isArray(registry.assets) || registry.assets.length === 0) errors.push("assets must be a non-empty array");
  const keys = new Set();
  for (const [index, asset] of (registry.assets ?? []).entries()) {
    const at = `asset ${index}`;
    if (!asset || typeof asset !== "object") { errors.push(`${at} must be an object`); continue; }
    if (typeof asset.registryKey !== "string" || !ID.test(asset.registryKey)) errors.push(`${at} registryKey is invalid`);
    if (keys.has(asset.registryKey)) errors.push(`duplicate registryKey ${asset.registryKey}`);
    keys.add(asset.registryKey);
    if (typeof asset.semanticJob !== "string" || !asset.semanticJob.trim()) errors.push(`${at} semanticJob is required`);
    if (!["COMPONENT", "COMPONENT_SET"].includes(asset.kind)) errors.push(`${at} kind is invalid`);
    if (!IDENTITY.has(asset.identityState)) errors.push(`${at} identityState is invalid`);
    const source = asset.source;
    if (!source || typeof source.published !== "boolean" || typeof source.fileName !== "string" || !source.fileName) errors.push(`${at} source is invalid`);
    if (source?.published && (!source.componentKey || !source.fileKey || !source.libraryName)) errors.push(`${at} published source requires componentKey, fileKey, and libraryName`);
    const contract = asset.contract;
    if (!contract || !stringArray(contract.anatomy) || !stringArray(contract.properties) || !stringArray(contract.states)) errors.push(`${at} contract is invalid`);
    const verification = asset.verification;
    if (!verification || !EVIDENCE.has(verification.state) || !Array.isArray(verification.evidence)) errors.push(`${at} verification is invalid`);
    if (verification?.state === "PASS" && verification.evidence.length === 0) errors.push(`${at} PASS requires evidence`);
    if (!Array.isArray(asset.consumers)) errors.push(`${at} consumers must be an array`);
    for (const [consumerIndex, consumer] of (asset.consumers ?? []).entries()) {
      if (!consumer || typeof consumer.pageId !== "string" || !consumer.pageId || typeof consumer.instanceId !== "string" || !consumer.instanceId || !LINK.has(consumer.linkState)) {
        errors.push(`${at} consumer ${consumerIndex} is invalid`);
      }
    }
    if (asset.identityState === "LOCAL_VERIFIED") {
      if (!source?.nodeId || verification?.state !== "PASS") errors.push(`${at} LOCAL_VERIFIED requires source.nodeId and PASS verification`);
      if ((asset.consumers ?? []).some((consumer) => consumer.linkState !== "LINKED" || consumer.mainComponentId !== source.nodeId)) {
        errors.push(`${at} LOCAL_VERIFIED consumers must link to source.nodeId`);
      }
    }
    if (asset.identityState === "LIBRARY_IMPORTED_VERIFIED") {
      if (!source?.published || verification?.state !== "PASS" || !(asset.consumers ?? []).some((consumer) => consumer.linkState === "LINKED")) {
        errors.push(`${at} LIBRARY_IMPORTED_VERIFIED requires published source, PASS, and a linked consumer`);
      }
    }
    if (asset.identityState === "LIBRARY_DISCOVERED" && verification?.state === "PASS") errors.push(`${at} LIBRARY_DISCOVERED cannot claim PASS consumption`);
    if (asset.identityState === "NOT_RUN" && verification?.state !== "NOT_RUN") errors.push(`${at} NOT_RUN identity requires NOT_RUN verification`);
  }
  return errors;
}

function stringArray(value) {
  return Array.isArray(value) && new Set(value).size === value.length && value.every((item) => typeof item === "string" && item.length > 0);
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: validate-reuse-registry.mjs <registry.json>");
  const registry = JSON.parse(await readFile(path, "utf8"));
  const errors = validateReuseRegistry(registry);
  if (errors.length) throw new Error(`Invalid reuse registry:\n- ${errors.join("\n- ")}`);
  const consumers = registry.assets.reduce((count, asset) => count + asset.consumers.length, 0);
  process.stdout.write(`${JSON.stringify({ valid: true, registryId: registry.registryId, assets: registry.assets.length, consumers })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

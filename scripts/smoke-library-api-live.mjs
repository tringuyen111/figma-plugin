import { dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { RuntimeClient, assert, readOption } from "./lib/runtime-client.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtime = new RuntimeClient({ name: "figma-library-api-live-smoke" });
const requestedInstanceId = readOption("instance-id");
const requestedFileName = readOption("file-name");
assert(requestedFileName, "Pass --file-name with the exact connected source-library file name.");
const outputPath = resolve(root, "output/figma-evidence/library-api-live.json");

try {
  await runtime.connect();
  const status = await runtime.status(true);
  assert(status.pluginConnected === true, "No Figma companion is connected.");
  const candidates = (status.instances ?? []).filter((instance) => instance.fileName === requestedFileName);
  const instance = requestedInstanceId
    ? (status.instances ?? []).find((candidate) => candidate.instanceId === requestedInstanceId)
    : candidates.length === 1 ? candidates[0] : undefined;
  assert(instance, requestedInstanceId
    ? `Connected instance ${requestedInstanceId} was not found.`
    : `Expected exactly one connected instance named ${requestedFileName}; found ${candidates.length}. Pass --instance-id.`);

  const response = await runtime.call("figma_query", {
    kind: "library_inventory",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-design-to-design",
    traceId: `figma-library-api-live:${Date.now()}`,
    attempt: 1,
    operation: {
      label: "Inspect native Figma library lifecycle API",
      kind: "read",
      phase: "verify",
      planId: "figma-library-api-upgrade",
      stepId: "P4.live-read",
      representation: "typed-graph",
      target: `${instance.fileName} / ${instance.pageName}`,
      postconditions: ["Typed library identity/status returned", "No Figma write performed", "Publish boundary remains explicit"],
    },
  }, 90_000);
  const data = response?.result ?? response;
  const workCard = data.local?.components?.find((asset) => asset.type === "COMPONENT_SET" && asset.name === "Work Card / Default") ?? null;
  assert(workCard, "Work Card / Default component set was not found in typed library inventory.");
  assert(data.publicationAuthority?.pluginApiCanPublishLibrary === false, "Publish authority was incorrectly reported as available.");
  assert(data.publicationAuthority?.pluginApiCanImportPublishedAssetsByKey === true, "Published-key import authority was not reported.");

  const proof = {
    generatedAt: new Date().toISOString(),
    state: "PASS_TYPED_LIBRARY_INVENTORY_READ_ONLY",
    writePerformed: false,
    instance: { instanceId: instance.instanceId, fileName: instance.fileName, pageId: instance.pageId, pageName: instance.pageName, bundleRevision: instance.bundleRevision },
    file: { fileName: data.fileName, fileKey: data.fileKey, editorType: data.editorType },
    componentSet: workCard,
    enabledLibraries: { variableCollectionCount: data.enabledLibraries?.variableCollections?.length ?? null, error: data.enabledLibraries?.error ?? null },
    publicationAuthority: data.publicationAuthority,
    apiEvidence: [
      "getPublishStatusAsync",
      "ComponentNode.key / ComponentSetNode.key",
      "figma.importComponentByKeyAsync",
      "figma.importComponentSetByKeyAsync",
      "figma.importStyleByKeyAsync",
      "figma.variables.importVariableByKeyAsync",
      "figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync",
      "figma.teamLibrary.getVariablesInLibraryCollectionAsync",
    ],
    nextAction: workCard.publishStatus === "CURRENT" && workCard.remote === true
      ? "Run a confirmed typed import in the exact target instance, then read back mainComponentKey and properties."
      : "Publish the source library through Figma authority, then rerun this read-only smoke before any import.",
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
} finally {
  await runtime.close();
}

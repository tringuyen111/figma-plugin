import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeClient, assert, readOption, textPayload } from "./lib/runtime-client.mjs";
import { createTrajectoryRecorder } from "./lib/trajectory-evidence.mjs";
import { buildLumaAuthoringPhases } from "./lib/luma-realistic-authoring.mjs";

const WAIT_TIMEOUT_MS = 5 * 60_000;
const STATUS_POLL_MS = 1_000;
const NORMAL_TIMEOUT_MS = 150_000;
const EXEC_TIMEOUT_MS = 330_000;
const EXPORT_TIMEOUT_MS = 330_000;
const GRAPH_LIMIT = 1_000;
const MAX_PAGES_OF_RESULTS = 1_000;
const BASELINE_EXPORTS_PER_PAGE = 2;
const EXPECTED_MAJOR_MINOR = "0.7.";

export async function main() {
  const expectedBundleRevision = readOption("--bundle-revision") ?? null;
  const startedAt = new Date().toISOString();
  const runId = `${compactTimestamp(startedAt)}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const traceRoot = `luma-realistic:${runId}`;
  const planId = `luma-realistic-rebuild:${runId}`;
  const registryKey = `luma-realistic-rebuild:${runId}`;
  const evidenceDir = resolve("output/figma-evidence");
  const journalPath = resolve(evidenceDir, `luma-realistic-rebuild-${runId}.trajectory.jsonl`);
  const rawJournalPath = resolve(evidenceDir, `luma-realistic-rebuild-${runId}.raw.jsonl`);
  const summaryPath = resolve(evidenceDir, `luma-realistic-rebuild-${runId}.summary.json`);
  const runtime = new RuntimeClient({ name: "luma-realistic-rebuild-live" });
  const journal = createTrajectoryRecorder({
    runId,
    caseId: "luma-realistic-rebuild-live",
    compactPath: journalPath,
    rawPath: rawJournalPath,
    provenance: {
      candidate: { archiveSha256: readOption("--candidate-sha256") ?? null, sourceRevision: null },
      runner: { name: "luma-realistic-rebuild-live", version: "1" },
      model: { state: "NOT_RUN", id: null },
      runtime: { state: "NOT_RUN", bundleRevision: expectedBundleRevision, protocolVersion: null, instanceId: null },
    },
  });
  const summary = {
    schemaVersion: 1,
    kind: "LumaRealisticRebuildRun",
    runId,
    traceRoot,
    planId,
    startedAt,
    finishedAt: null,
    workflowState: "STARTING",
    boundedVerdict: "NOT_RUN",
    target: null,
    pageIds: null,
    phases: [],
    baselineExports: [],
    materialExports: [],
    queryCoverage: {},
    finalRuntime: null,
    failure: null,
    limitations: [
      "A captured PNG is not a visual-quality PASS until it is inspected against explicit expected truth.",
      "Typed structural facts do not prove Presentation playback, runtime accessibility, publication, UAT, or release readiness.",
      "clear_file_owned_assets uses dry-run plus confirm and one undo boundary, but it does not consume expectedPlanHash.",
    ],
    evidence: { journalPath, rawJournalPath, summaryPath },
  };

  let connected = false;
  let pinned = null;
  let changeCursor = null;
  let fatalError = null;

  await mkdir(evidenceDir, { recursive: true });
  await journal.write("session-start", "OBSERVED", { startedAt, traceRoot, planId, registryKey });

  try {
    await runtime.connect();
    connected = true;
    const initialStatus = await waitForOneCurrentCompanion(runtime, journal, WAIT_TIMEOUT_MS, expectedBundleRevision);
    const instance = initialStatus.instances[0];
    pinned = {
      instanceId: instance.instanceId,
      initialPageId: instance.pageId,
      fileKey: instance.fileKey ?? null,
      fileName: instance.fileName,
      editorType: instance.editorType,
      bundleRevision: instance.bundleRevision,
      serverVersion: initialStatus.serverVersion,
      protocolVersion: initialStatus.protocolVersion,
    };
    summary.target = pinned;
    summary.workflowState = "TARGET_PINNED";
    journal.observeProvenance({ runtime: { state: "OBSERVED", bundleRevision: pinned.bundleRevision, protocolVersion: pinned.protocolVersion, instanceId: pinned.instanceId, serverVersion: pinned.serverVersion, fileKey: pinned.fileKey, fileName: pinned.fileName } });
    await journal.write("target-pinned", "OBSERVED", pinned);

    const preManifest = await query(runtime, journal, pinned, traceRoot, planId, "pre-manifest", "artifact_manifest", {
      refresh: true,
    });
    const preInventory = await query(runtime, journal, pinned, traceRoot, planId, "pre-inventory", "file_inventory");
    const preFeed = await query(runtime, journal, pinned, traceRoot, planId, "pre-change-feed", "change_feed", {
      refresh: true,
    });
    changeCursor = nextChangeCursor(preFeed);

    const pages = requirePages(preInventory);
    const pinnedPageIds = pages.map((page) => page.id);
    assert(pinnedPageIds.includes(pinned.initialPageId), "The initially pinned page is missing from typed file inventory.");
    const pageIds = resolveLumaPageRoles(pages);
    summary.pageIds = pageIds;
    await journal.write("page-roles-pinned", "OBSERVED", { pages, pageIds, pinnedPageIds });

    // Build and validate every authoring payload before the destructive boundary.
    // This cannot prove Figma runtime behavior, but it prevents local builder or
    // phase-contract failures from being discovered only after the file is clear.
    const phaseContext = {
      runId,
      traceRoot,
      registryKey,
      bundleRevision: pinned.bundleRevision,
      pageIds,
      testLabInput: {
        title: "Realistic Luma rebuild evidence shell — claims remain NOT_RUN until admitted",
        fileName: pinned.fileName,
        bundleRevision: pinned.bundleRevision,
        claims: [],
      },
    };
    const built = await buildLumaAuthoringPhases(phaseContext);
    const phases = Array.isArray(built) ? built : built?.phases;
    assert(Array.isArray(phases) && phases.length > 0, "buildLumaAuthoringPhases must return a non-empty ordered phase array.");
    phases.forEach((phase, index) => validatePhase(phase, index, pageIds));
    await journal.write("authoring-payloads-preflighted", "OBSERVED", {
      phaseIds: phases.map((phase) => phase.id),
      codeLengths: phases.map((phase) => ({ id: phase.id, chars: phase.code.length })),
    });

    const preGraph = await paginatedQuery(runtime, journal, pinned, traceRoot, planId, "pre-entity-graph", "entity_graph", {
      scope: "document",
      projection: ["scene", "layout", "text", "component", "bindings", "prototype", "motion", "metadata"],
      refresh: true,
      limit: GRAPH_LIMIT,
    });
    summary.queryCoverage.preEntityGraph = preGraph.coverage;
    assert(preGraph.coverage.complete === true, "Pre-clear entity graph coverage is incomplete.");

    const representativeRoots = chooseRepresentativeRoots(preGraph.items, pages, BASELINE_EXPORTS_PER_PAGE);
    await journal.write("baseline-export-selection", "OBSERVED", {
      policy: `Largest visible top-level exportable candidates, up to ${BASELINE_EXPORTS_PER_PAGE} per page`,
      roots: representativeRoots,
    });
    summary.baselineExports = await exportRepresentatives({
      runtime,
      journal,
      pinned,
      traceRoot,
      planId,
      evidenceDir,
      runId,
      roots: representativeRoots,
      stage: "baseline",
    });
    assertBaselineExportCoverage(representativeRoots, summary.baselineExports);

    if (inventoryIsEmpty(preInventory, pinnedPageIds)) {
      summary.workflowState = "CLEAR_VERIFIED";
      await journal.write("clear-recovery-precondition", "OBSERVED", {
        reason: "The previous guarded run already verified this exact three-page file was empty before authoring failed.",
        snapshotId: snapshotId(preManifest),
        inventory: summarizeInventory(preInventory),
      });
    } else {
    const clearTraceId = `${traceRoot}:clear`;
    const clearTarget = `${pinned.fileName} / exact pages ${pinnedPageIds.join(",")}`;
    const clearBase = {
      action: "clear_file_owned_assets",
      pageIds: pinnedPageIds,
      removeLocalAssets: true,
      instanceId: pinned.instanceId,
      pageId: pinned.initialPageId,
      capability: "figma-native",
      traceId: clearTraceId,
      attempt: 1,
    };
    const clearPlan = await toolStep(runtime, journal, "clear-plan", "figma_apply", {
      ...clearBase,
      dryRun: true,
      operation: operation(planId, "clear-file", "Plan exact Luma file clear", "write", "plan", clearTarget, "table", [
        "Dry-run targets exactly the pinned pages, includes local assets, and performs no write",
      ]),
    });
    validateClearPlan(clearPlan, pinnedPageIds);
    await assertPinnedRuntime(runtime, journal, pinned, "before-clear-execute");

    const clearResult = await mutationStep(runtime, journal, "clear-execute", "figma_apply", {
      ...clearBase,
      dryRun: false,
      confirm: true,
      operation: operation(planId, "clear-file", "Execute exact Luma file clear", "write", "execute", clearTarget, "table", [
        "Every pinned page is empty and all local styles and variable collections are removed",
      ]),
    }, NORMAL_TIMEOUT_MS, async (failure) => {
      await reconcileAmbiguousMutation(runtime, journal, pinned, traceRoot, planId, "clear-execute", changeCursor, failure);
    });
    try {
      validateClearExecution(clearResult, pinnedPageIds);
    } catch (error) {
      await reconcileAmbiguousMutation(runtime, journal, pinned, traceRoot, planId, "clear-result-validation", changeCursor, error);
      throw new WorkflowError("FAIL", "Confirmed clear returned an invalid or incomplete result contract.", { cause: serializeError(error), clearResult: sanitizeResult(clearResult) });
    }

    const postClearManifest = await query(runtime, journal, pinned, traceRoot, planId, "post-clear-manifest", "artifact_manifest", {
      refresh: true,
    });
    const postClearInventory = await query(runtime, journal, pinned, traceRoot, planId, "post-clear-inventory", "file_inventory");
    const postClearFeed = await query(runtime, journal, pinned, traceRoot, planId, "post-clear-change-feed", "change_feed", {
      cursor: changeCursor ?? undefined,
      refresh: true,
    });
    changeCursor = nextChangeCursor(postClearFeed) ?? changeCursor;
    validateEmptyInventory(postClearInventory, pinnedPageIds);
    assert(snapshotId(postClearManifest) !== snapshotId(preManifest), "Clear verification returned the same artifact snapshot as the pre-clear file.");
    summary.workflowState = "CLEAR_VERIFIED";
    await journal.write("clear-verified", "OBSERVED", {
      snapshotId: snapshotId(postClearManifest),
      changeCursor,
      inventory: summarizeInventory(postClearInventory),
    });
    }

    const materialRoots = [];
    for (let index = 0; index < phases.length; index += 1) {
      const phase = validatePhase(phases[index], index, pageIds);
      const phasePageId = pageIds[phase.pageRole];
      const phaseTraceId = `${traceRoot}:author:${phase.id}`;
      const result = await mutationStep(runtime, journal, `author-${phase.id}`, "figma_exec", {
        code: phase.code,
        runtimeSdk: "v2",
        maxOutputChars: 100_000,
        instanceId: pinned.instanceId,
        pageId: phasePageId,
        capability: phase.capability ?? "figma-design-authoring",
        traceId: phaseTraceId,
        attempt: 1,
        operation: operation(planId, `author-${phase.id}`, phase.label ?? `Author Luma phase ${phase.id}`, "write", "execute", `${pinned.fileName} / ${phase.pageRole}`, phase.representation ?? "rendered-composition", phase.postconditions),
      }, EXEC_TIMEOUT_MS, async (failure) => {
        await reconcileAmbiguousMutation(runtime, journal, pinned, traceRoot, planId, `author-${phase.id}`, changeCursor, failure);
      });
      const identities = extractIdentityFields(result);
      const roots = extractMaterialRootIds(result).map((nodeId) => ({ nodeId, pageId: phasePageId, phaseId: phase.id }));
      materialRoots.push(...roots);
      summary.phases.push({ id: phase.id, pageRole: phase.pageRole, pageId: phasePageId, identities, materialRootIds: roots.map((item) => item.nodeId), state: "EXECUTED_READBACK_PENDING" });

      let phaseManifest;
      let phaseFeed;
      try {
        phaseManifest = await query(runtime, journal, pinned, traceRoot, planId, `after-${phase.id}-manifest`, "artifact_manifest", {
          refresh: true,
        });
        phaseFeed = await query(runtime, journal, pinned, traceRoot, planId, `after-${phase.id}-change-feed`, "change_feed", {
          cursor: changeCursor ?? undefined,
          refresh: true,
        });
      } catch (error) {
        await reconcileAmbiguousMutation(runtime, journal, pinned, traceRoot, planId, `after-${phase.id}-evidence`, changeCursor, error);
        throw error;
      }
      changeCursor = nextChangeCursor(phaseFeed) ?? changeCursor;
      summary.phases[summary.phases.length - 1].snapshotId = snapshotId(phaseManifest);
      summary.phases[summary.phases.length - 1].changeCursor = changeCursor;
      summary.phases[summary.phases.length - 1].state = "EXECUTED_AND_FACTS_CAPTURED";
      await journal.write(`after-${phase.id}-checkpoint`, "OBSERVED", {
        phaseId: phase.id,
        identities,
        materialRootIds: roots.map((item) => item.nodeId),
        snapshotId: snapshotId(phaseManifest),
        changeCursor,
      });
      assert(identities.length > 0, `Authoring phase ${phase.id} returned no registry/root identity fields.`);
    }

    const uniqueMaterialRoots = [...new Map(materialRoots.map((item) => [item.nodeId, item])).values()];
    assert(uniqueMaterialRoots.length > 0, "Authoring phases returned no material root IDs to export.");
    for (let index = 0; index < uniqueMaterialRoots.length; index += 1) {
      const root = uniqueMaterialRoots[index];
      await query(runtime, journal, pinned, traceRoot, planId, `material-structure-${index + 1}`, "structure", {
        nodeId: root.nodeId,
        includeChildren: true,
        routePageId: root.pageId,
      });
    }
    summary.materialExports = await exportRepresentatives({
      runtime,
      journal,
      pinned,
      traceRoot,
      planId,
      evidenceDir,
      runId,
      roots: uniqueMaterialRoots,
      stage: "material",
      requireEveryRoot: true,
    });

    const finalGraph = await paginatedQuery(runtime, journal, pinned, traceRoot, planId, "final-entity-graph", "entity_graph", {
      scope: "document",
      projection: ["scene", "layout", "text", "component", "bindings", "prototype", "motion", "metadata"],
      refresh: true,
      limit: GRAPH_LIMIT,
    });
    summary.queryCoverage.finalEntityGraph = finalGraph.coverage;
    assert(finalGraph.coverage.complete === true, "Final entity graph coverage remains truncated.");

    const fullQueries = [
      "component_integrity",
      "binding_inventory",
      "prototype_graph",
      "motion_snapshot",
      "accessibility_design_facts",
    ];
    for (const kind of fullQueries) {
      const captured = await paginatedQuery(runtime, journal, pinned, traceRoot, planId, `final-${kind}`, kind, {
        scope: "document",
        refresh: true,
        limit: GRAPH_LIMIT,
      });
      summary.queryCoverage[kind] = captured.coverage;
      assert(captured.coverage.complete === true, `${kind} coverage remains truncated.`);
    }

    const finalManifest = await query(runtime, journal, pinned, traceRoot, planId, "final-manifest", "artifact_manifest", {
      refresh: true,
    });
    const finalInventory = await query(runtime, journal, pinned, traceRoot, planId, "final-inventory", "file_inventory");
    const finalFeed = await query(runtime, journal, pinned, traceRoot, planId, "final-change-feed", "change_feed", {
      cursor: changeCursor ?? undefined,
      refresh: true,
    });
    changeCursor = nextChangeCursor(finalFeed) ?? changeCursor;
    const finalStatus = await assertPinnedRuntime(runtime, journal, pinned, "final-runtime", true);
    const finalInstance = finalStatus.instances.find((candidate) => candidate.instanceId === pinned.instanceId);
    assert(finalStatus.queueLength === 0 && finalStatus.pendingCount === 0 && finalInstance?.inFlight === 0, "Figma runtime did not return to idle.");

    summary.finalRuntime = {
      pluginConnected: finalStatus.pluginConnected,
      bundleRevision: finalStatus.bundleRevision,
      queueLength: finalStatus.queueLength,
      pendingCount: finalStatus.pendingCount,
      instanceInFlight: finalInstance?.inFlight ?? null,
      finalSnapshotId: snapshotId(finalManifest),
      changeCursor,
      inventory: summarizeInventory(finalInventory),
    };
    summary.workflowState = "EVIDENCE_CAPTURED";
  } catch (error) {
    fatalError = serializeError(error);
    summary.failure = fatalError;
    summary.workflowState = classifyWorkflowFailure(error);
    process.exitCode = 1;
    await journal.write("session-failure", summary.workflowState, fatalError);
  } finally {
    if (connected) {
      try {
        const statusArgs = { verbose: true };
        const statusStarted = performance.now();
        const raw = await runtime.callRaw("figma_status", statusArgs, 20_000);
        const payload = unwrapToolPayload(textPayload(raw));
        await journal.writeTool("finally-status", raw.isError === true ? "ERROR" : "OBSERVED", { tool: "figma_status", arguments: statusArgs, result: payload, elapsedMs: performance.now() - statusStarted });
        if (!summary.finalRuntime && raw.isError !== true) summary.finalRuntime = summarizeStatus(payload, pinned?.instanceId);
      } catch (error) {
        await journal.write("finally-status", "INCONCLUSIVE", { error: serializeError(error) });
      }
      try {
        await runtime.close();
      } catch (error) {
        await journal.write("runtime-close", "INCONCLUSIVE", { error: serializeError(error) });
        if (!fatalError) {
          fatalError = serializeError(error);
          summary.failure = fatalError;
          summary.workflowState = "INCONCLUSIVE";
          process.exitCode = 1;
        }
      }
    }
    summary.finishedAt = new Date().toISOString();
    await journal.write("session-summary", summary.workflowState, {
      summaryPath,
      boundedVerdict: summary.boundedVerdict,
      failure: summary.failure,
    });
    summary.trajectory = journal.snapshot();
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    process.stdout.write(`${JSON.stringify({ runId, workflowState: summary.workflowState, boundedVerdict: summary.boundedVerdict, journalPath, rawJournalPath, summaryPath })}\n`);
  }
}

async function waitForOneCurrentCompanion(runtime, journal, timeoutMs, expectedBundleRevision) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() <= deadline) {
    try {
      const statusArgs = { verbose: true };
      const statusStarted = performance.now();
      const raw = await runtime.callRaw("figma_status", statusArgs, 20_000);
      const payload = unwrapToolPayload(textPayload(raw));
      last = payload;
      await journal.writeTool("wait-for-companion", raw.isError === true ? "ERROR" : "OBSERVED", { tool: "figma_status", arguments: statusArgs, result: payload, elapsedMs: performance.now() - statusStarted });
      if (raw.isError !== true && isOneCurrentCompanion(payload, expectedBundleRevision)) return payload;
    } catch (error) {
      last = { error: serializeError(error) };
      await journal.write("wait-for-companion", "INCONCLUSIVE", last);
    }
    await delay(STATUS_POLL_MS);
  }
  throw new WorkflowError("BLOCKED", `No single connected 0.7 companion${expectedBundleRevision ? ` with bundle ${expectedBundleRevision}` : ""} became available within ${timeoutMs}ms.`, { lastStatus: last, expectedBundleRevision });
}

function isOneCurrentCompanion(status, expectedBundleRevision) {
  if (!status
    || status.pluginConnected !== true
    || !String(status.serverVersion ?? "").startsWith(EXPECTED_MAJOR_MINOR)
    || status.protocolVersion !== 10) return false;
  if (expectedBundleRevision && status.bundleRevision !== expectedBundleRevision) return false;
  const instances = Array.isArray(status.instances) ? status.instances : [];
  if (instances.length !== 1) return false;
  const instance = instances[0];
  return instance.bundleRevision === status.bundleRevision
    && Array.isArray(instance.runtimeSdks)
    && instance.runtimeSdks.includes("v2");
}

async function assertPinnedRuntime(runtime, journal, pinned, stepId, requireIdle = false) {
  const statusArgs = { verbose: true };
  const statusStarted = performance.now();
  const raw = await runtime.callRaw("figma_status", statusArgs, 20_000);
  const status = unwrapToolPayload(textPayload(raw));
  await journal.writeTool(stepId, raw.isError === true ? "ERROR" : "OBSERVED", { tool: "figma_status", arguments: statusArgs, result: status, elapsedMs: performance.now() - statusStarted });
  if (raw.isError === true) throw toolFailure(stepId, "figma_status", status);
  const instance = status.instances?.find((candidate) => candidate.instanceId === pinned.instanceId);
  assert(status.pluginConnected === true && instance, `Pinned Figma instance ${pinned.instanceId} is not connected.`);
  assert(status.serverVersion === pinned.serverVersion && status.bundleRevision === pinned.bundleRevision, "Server runtime identity drifted from the pinned 0.7 companion.");
  assert(instance.bundleRevision === pinned.bundleRevision && instance.fileName === pinned.fileName && (instance.fileKey ?? null) === pinned.fileKey, "Pinned Figma file or companion identity drifted.");
  if (requireIdle) assert(status.queueLength === 0 && status.pendingCount === 0 && instance.inFlight === 0, "Pinned runtime is not idle.");
  return status;
}

async function query(runtime, journal, pinned, traceRoot, planId, stepId, kind, extra = {}) {
  const { routePageId = pinned.initialPageId, evidenceTags = {}, ...queryParams } = extra;
  return toolStep(runtime, journal, stepId, "figma_query", {
    kind,
    ...queryParams,
    instanceId: pinned.instanceId,
    pageId: routePageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:${stepId}`,
    attempt: 1,
    operation: operation(planId, stepId, `Capture ${kind} evidence`, "read", "verify", `${pinned.fileName} / pinned file`, evidenceRepresentation(kind), [
      "Facts are bound to the exact pinned companion and file",
    ]),
  }, NORMAL_TIMEOUT_MS, evidenceTags);
}

async function paginatedQuery(runtime, journal, pinned, traceRoot, planId, stepId, kind, params) {
  const pages = [];
  const items = [];
  const seen = new Set();
  let cursor;
  for (let index = 0; index < MAX_PAGES_OF_RESULTS; index += 1) {
    const result = await query(runtime, journal, pinned, traceRoot, planId, `${stepId}-${index + 1}`, kind, {
      ...params,
      ...(cursor ? { cursor } : {}),
    });
    pages.push(result);
    items.push(...factsArray(result));
    const coverage = evidenceCoverage(result);
    if (coverage?.truncated !== true) return {
      pages,
      items,
      coverage: { complete: true, pages: pages.length, returned: items.length, last: coverage ?? null },
    };
    const next = coverage.nextCursor;
    if (typeof next !== "string" || !next || seen.has(next)) throw new WorkflowError("INCONCLUSIVE", `${kind} pagination did not advance.`, { stepId, coverage });
    seen.add(next);
    cursor = next;
  }
  throw new WorkflowError("INCONCLUSIVE", `${kind} exceeded ${MAX_PAGES_OF_RESULTS} evidence pages.`, { stepId });
}

async function toolStep(runtime, journal, stepId, tool, args, timeout = NORMAL_TIMEOUT_MS, evidenceTags = {}) {
  const started = performance.now();
  let raw;
  try {
    raw = await runtime.callRaw(tool, args, timeout);
  } catch (error) {
    const failure = new WorkflowError(isMutationTool(tool) ? "INCONCLUSIVE" : "BLOCKED", `${tool} transport failed during ${stepId}.`, {
      tool,
      stepId,
      providerStateUnknown: isMutationTool(tool),
      cause: serializeError(error),
    });
    await journal.writeTool(stepId, failure.state, { tool, arguments: args, result: { transportError: failure.details }, elapsedMs: performance.now() - started, tags: evidenceTags });
    throw failure;
  }
  const payload = unwrapToolPayload(textPayload(raw));
  await journal.writeTool(stepId, raw.isError === true ? "ERROR" : "OBSERVED", { tool, arguments: args, result: payload, elapsedMs: performance.now() - started, tags: evidenceTags });
  if (raw.isError === true) throw toolFailure(stepId, tool, payload);
  return payload;
}

async function mutationStep(runtime, journal, stepId, tool, args, timeout, reconcile) {
  try {
    return await toolStep(runtime, journal, stepId, tool, args, timeout);
  } catch (error) {
    if (shouldReconcile(error)) {
      try {
        await reconcile(error);
      } catch (reconcileError) {
        await journal.write(`${stepId}-reconcile-failure`, "INCONCLUSIVE", { error: serializeError(reconcileError) });
      }
    }
    throw error;
  }
}

async function reconcileAmbiguousMutation(runtime, journal, pinned, traceRoot, planId, stepId, cursor, failure) {
  await journal.write(`${stepId}-reconcile-start`, "INCONCLUSIVE", { failure: serializeError(failure), cursor });
  try { await assertPinnedRuntime(runtime, journal, pinned, `${stepId}-reconcile-status`); } catch {}
  try { await query(runtime, journal, pinned, traceRoot, planId, `${stepId}-reconcile-manifest`, "artifact_manifest", { refresh: true, evidenceTags: { requery: true } }); } catch {}
  try { await query(runtime, journal, pinned, traceRoot, planId, `${stepId}-reconcile-inventory`, "file_inventory", { evidenceTags: { requery: true } }); } catch {}
  try { await query(runtime, journal, pinned, traceRoot, planId, `${stepId}-reconcile-feed`, "change_feed", { cursor: cursor ?? undefined, refresh: true, evidenceTags: { requery: true } }); } catch {}
}

async function exportRepresentatives({ runtime, journal, pinned, traceRoot, planId, evidenceDir, runId, roots, stage, requireEveryRoot = false }) {
  const artifacts = [];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    const stepId = `${stage}-export-${index + 1}`;
    const result = await exportOne(runtime, journal, pinned, traceRoot, planId, stepId, root, `${runId}-${stage}-${index + 1}`);
    if (!result) {
      if (requireEveryRoot) throw new WorkflowError("INCONCLUSIVE", `Required ${stage} export failed for ${root.nodeId}.`, { root });
      continue;
    }
    const sourcePath = result.path;
    assert(typeof sourcePath === "string" && sourcePath.length > 0, `Export ${stepId} returned no artifact path.`);
    const destinationPath = resolve(evidenceDir, `luma-realistic-rebuild-${runId}-${stage}-${index + 1}.png`);
    await copyFile(sourcePath, destinationPath);
    const bytes = await readFile(destinationPath);
    const raster = readPngDimensions(bytes);
    const rasterValid = raster !== null && raster.width > 1 && raster.height > 1;
    if (!rasterValid) {
      await journal.write(`${stepId}-invalid-raster`, "INCONCLUSIVE", { root, destinationPath, raster, byteLength: bytes.byteLength, providerArtifact: sanitizeResult(result) });
      if (requireEveryRoot) throw new WorkflowError("INCONCLUSIVE", `Required ${stage} export produced an invalid PNG raster for ${root.nodeId}.`, { root, destinationPath, raster, byteLength: bytes.byteLength });
      continue;
    }
    const artifact = { ...result, evidencePath: destinationPath, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength, actualPixelWidth: raster.width, actualPixelHeight: raster.height, stage, pageId: root.pageId, phaseId: root.phaseId ?? null };
    artifacts.push(artifact);
    await journal.write(`${stepId}-persisted`, "OBSERVED", artifact);
  }
  return artifacts;
}

async function exportOne(runtime, journal, pinned, traceRoot, planId, stepId, root, filename) {
  try {
    const exportArgs = {
      nodeId: root.nodeId,
      format: "PNG",
      constraint: { type: "SCALE", value: 1 },
      contentsOnly: true,
      colorProfile: "SRGB",
      maxBytes: 32 * 1024 * 1024,
      filename,
      instanceId: pinned.instanceId,
      pageId: root.pageId,
      capability: "figma-verification",
      traceId: `${traceRoot}:${stepId}`,
      attempt: 1,
      operation: operation(planId, stepId, `Export ${stepId}`, "export", "verify", `${pinned.fileName} / ${root.nodeId}`, "artifact", [
        "Persisted PNG is produced from the exact selected root",
      ]),
    };
    const exportStarted = performance.now();
    const raw = await runtime.callRaw("figma_export", exportArgs, EXPORT_TIMEOUT_MS);
    const payload = unwrapToolPayload(textPayload(raw));
    const artifact = raw.structuredContent?.artifact ?? payload?.artifact ?? payload;
    await journal.writeTool(stepId, raw.isError === true ? "ERROR" : "OBSERVED", { tool: "figma_export", arguments: exportArgs, result: { payload, artifact }, elapsedMs: performance.now() - exportStarted });
    return raw.isError === true ? null : artifact;
  } catch (error) {
    await journal.write(stepId, "INCONCLUSIVE", { tool: "figma_export", error: serializeError(error) });
    return null;
  }
}

function validateClearPlan(result, expectedPageIds) {
  assert(result?.dryRun === true && result?.plan?.removeLocalAssets === true, "Clear dry-run did not preserve removeLocalAssets=true.");
  const actual = result.plan.pages?.map((page) => page.id) ?? [];
  assert(sameSet(actual, expectedPageIds), "Clear dry-run page IDs do not match the pinned file pages.");
}

function validateClearExecution(result, expectedPageIds) {
  assert(result?.dryRun === false && result?.confirm === true && result?.undoCommitted === true, "Confirmed clear did not return its committed undo boundary.");
  const cleared = Array.isArray(result.clearedPages) ? result.clearedPages : [];
  assert(sameSet(cleared.map((page) => page.id), expectedPageIds), "Confirmed clear did not report every pinned page.");
  assert(cleared.every((page) => page.remainingCount === 0 && Array.isArray(page.skipped) && page.skipped.length === 0), "Confirmed clear left nodes or skipped targets.");
}

function validateEmptyInventory(inventory, expectedPageIds) {
  const pages = requirePages(inventory).filter((page) => expectedPageIds.includes(page.id));
  assert(pages.length === expectedPageIds.length, "Post-clear inventory omitted a pinned page.");
  assert(pages.every((page) => page.childCount === 0 && page.descendantCount === 0), "Post-clear inventory is not empty.");
  assert(inventory.components?.total === 0, "Post-clear inventory still contains component assets.");
  assert(Object.values(inventory.localStyles ?? {}).every((value) => value === 0), "Post-clear inventory still contains local styles.");
  assert(inventory.variables?.collections === 0 && inventory.variables?.variables === 0, "Post-clear inventory still contains local variables.");
}

function inventoryIsEmpty(inventory, expectedPageIds) {
  try {
    validateEmptyInventory(inventory, expectedPageIds);
    return true;
  } catch {
    return false;
  }
}

function validatePhase(phase, index, pageIds) {
  assert(phase && typeof phase === "object", `Authoring phase ${index + 1} must be an object.`);
  assert(typeof phase.id === "string" && phase.id.length > 0, `Authoring phase ${index + 1} requires id.`);
  assert(typeof phase.pageRole === "string" && typeof pageIds[phase.pageRole] === "string", `Authoring phase ${phase.id} has unknown pageRole ${String(phase.pageRole)}.`);
  assert(typeof phase.code === "string" && phase.code.length > 0, `Authoring phase ${phase.id} requires code.`);
  assert(Array.isArray(phase.postconditions) && phase.postconditions.length > 0, `Authoring phase ${phase.id} requires explicit postconditions.`);
  return phase;
}

function requirePages(inventory) {
  const pages = inventory?.pages;
  assert(Array.isArray(pages) && pages.length > 0, "Typed file inventory returned no pages.");
  return pages;
}

function resolveLumaPageRoles(pages) {
  assert(pages.length === 3, `Destructive Luma rebuild requires exactly three pages; inventory returned ${pages.length}.`);
  const unused = new Set(pages.map((page) => page.id));
  const take = (pattern) => {
    const matches = pages.filter((page) => unused.has(page.id) && pattern.test(page.name));
    assert(matches.length === 1, `Cannot uniquely resolve required Luma page role for ${pattern}; matched ${matches.length}.`);
    const selected = matches[0];
    unused.delete(selected.id);
    return selected.id;
  };
  const pageIds = {
    system: take(/Luma Bank\s*\/\s*System & Components/i),
    screens: take(/Luma Bank\s*\/\s*Mobile Screens/i),
    flow: take(/Luma Bank\s*\/\s*Flow & States/i),
  };
  assert(new Set(Object.values(pageIds)).size === 3, "Luma page roles must resolve to three distinct pinned pages.");
  return pageIds;
}

function chooseRepresentativeRoots(items, pages, maxPerPage) {
  const pageIds = new Set(pages.map((page) => page.id));
  const allowed = new Set(["FRAME", "SECTION", "COMPONENT_SET", "COMPONENT", "INSTANCE", "GROUP"]);
  const roots = items.filter((item) => pageIds.has(item.parentId) && item.visible !== false && allowed.has(item.type));
  const selected = [];
  for (const page of pages) {
    const candidates = roots.filter((item) => item.parentId === page.id).sort((left, right) => area(right) - area(left));
    selected.push(...candidates.slice(0, maxPerPage).map((item) => ({ nodeId: item.id, pageId: page.id, nodeName: item.name, nodeType: item.type })));
  }
  return selected;
}

function assertBaselineExportCoverage(roots, exports_) {
  const pagesWithRoots = new Set(roots.map((root) => root.pageId));
  const pagesWithExports = new Set(exports_.map((artifact) => artifact.pageId));
  for (const pageId of pagesWithRoots) assert(pagesWithExports.has(pageId), `No representative baseline export succeeded for non-empty page ${pageId}.`);
}

function extractIdentityFields(value, path = "result", output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => extractIdentityFields(item, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`;
    if (/(Id|Ids|Key|Keys)$/i.test(key)) output.push({ path: itemPath, value: sanitizeResult(item) });
    if (item && typeof item === "object") extractIdentityFields(item, itemPath, output);
  }
  return output;
}

function extractMaterialRootIds(value) {
  const ids = [];
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (/^(materialRootId|materialRootIds|rootId|rootIds)$/i.test(key)) {
        if (typeof child === "string") ids.push(child);
        else if (Array.isArray(child)) ids.push(...child.filter((entry) => typeof entry === "string"));
        else if (child && typeof child === "object") ids.push(...Object.values(child).filter((entry) => typeof entry === "string"));
      }
      if (child && typeof child === "object") visit(child);
    }
  };
  visit(value);
  if (ids.length === 0 && value && typeof value === "object") {
    for (const key of ["board", "screens", "states", "overlays", "componentSets", "specimens", "sections"]) collectImmediateIds(value[key], ids);
  }
  return [...new Set(ids)];
}

function collectImmediateIds(value, output) {
  if (Array.isArray(value)) {
    for (const item of value) if (item && typeof item === "object" && typeof item.id === "string") output.push(item.id);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.id === "string") output.push(value.id);
  for (const item of Object.values(value)) if (item && typeof item === "object" && typeof item.id === "string") output.push(item.id);
}

function factsArray(result) {
  const facts = result?.facts;
  if (Array.isArray(facts?.items)) return facts.items;
  if (Array.isArray(facts?.nodes)) return facts.nodes;
  if (Array.isArray(facts?.interactive)) return facts.interactive;
  if (Array.isArray(facts?.edges)) return facts.edges;
  if (Array.isArray(facts?.components)) return facts.components;
  return [];
}

function evidenceCoverage(result) {
  return result?.coverage ?? result?.facts?.graphCoverage ?? null;
}

function snapshotId(result) {
  return result?.target?.snapshotId ?? result?.facts?.snapshotId ?? null;
}

function nextChangeCursor(result) {
  return result?.facts?.nextCursor ?? result?.nextCursor ?? null;
}

function operation(planId, stepId, label, kind, phase, target, representation, postconditions) {
  return { label, kind, phase, planId, stepId, target, representation, postconditions };
}

function evidenceRepresentation(kind) {
  if (kind === "prototype_graph") return "state-diagram";
  if (kind === "motion_snapshot" || kind === "change_feed") return "timeline";
  if (kind === "entity_graph" || kind === "component_integrity") return "tree";
  return "table";
}

function toolFailure(stepId, tool, payload) {
  const disposition = payload?.error && typeof payload.error === "object" ? payload.error : payload;
  const state = disposition?.possiblyCommitted === true || disposition?.providerStateUnknown === true ? "INCONCLUSIVE" : "FAIL";
  return new WorkflowError(state, `${tool} failed during ${stepId}: ${disposition?.code ?? "UNKNOWN"}: ${disposition?.message ?? JSON.stringify(disposition)}`, {
    tool,
    stepId,
    ...sanitizeResult(disposition),
  });
}

function shouldReconcile(error) {
  return error instanceof WorkflowError && (error.details?.possiblyCommitted === true || error.details?.providerStateUnknown === true);
}

function isMutationTool(tool) {
  return tool === "figma_apply" || tool === "figma_exec";
}

function classifyWorkflowFailure(error) {
  if (error instanceof WorkflowError && ["BLOCKED", "INCONCLUSIVE", "FAIL"].includes(error.state)) return error.state;
  return "FAIL";
}

class WorkflowError extends Error {
  constructor(state, message, details = {}) {
    super(message);
    this.name = "WorkflowError";
    this.state = state;
    this.details = details;
  }
}

function unwrapToolPayload(payload) {
  if (payload && payload.status === "success" && payload.result !== undefined) return payload.result;
  if (payload && payload.status === "error" && payload.error !== undefined) return payload.error;
  return payload;
}

function sanitizeResult(value, depth = 0) {
  if (depth > 16) return "[MaxDepth]";
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return value ?? null;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeResult(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "bytes" && key !== "base64").map(([key, item]) => [key, sanitizeResult(item, depth + 1)]));
  return String(value);
}

function readPngDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function serializeError(error) {
  if (error instanceof WorkflowError) return { name: error.name, state: error.state, message: error.message, details: sanitizeResult(error.details), stack: error.stack ?? null };
  if (error instanceof Error) return { name: error.name, state: "FAIL", message: error.message, stack: error.stack ?? null };
  return { name: "UnknownError", state: "FAIL", message: String(error) };
}

function summarizeInventory(inventory) {
  return {
    pages: inventory?.pages?.map((page) => ({ id: page.id, name: page.name, childCount: page.childCount, descendantCount: page.descendantCount })) ?? [],
    components: inventory?.components ?? null,
    localStyles: inventory?.localStyles ?? null,
    variables: inventory?.variables ?? null,
  };
}

function summarizeStatus(status, instanceId) {
  const instance = status?.instances?.find((candidate) => candidate.instanceId === instanceId);
  return {
    pluginConnected: status?.pluginConnected ?? false,
    serverVersion: status?.serverVersion ?? null,
    bundleRevision: status?.bundleRevision ?? null,
    queueLength: status?.queueLength ?? null,
    pendingCount: status?.pendingCount ?? null,
    instanceInFlight: instance?.inFlight ?? null,
  };
}

function sameSet(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function area(item) {
  return (typeof item.width === "number" ? item.width : 0) * (typeof item.height === "number" ? item.height : 0);
}

function compactTimestamp(value) {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

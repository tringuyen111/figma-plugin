import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "figma-typed-sync-cleanup-check" });
try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status);
  const result = await runtime.call("figma_exec", {
    code: "return figma.currentPage.findAll(function (node) { return node.name === 'Control Sync Lab'; }).map(function (node) { return { id: node.id, name: node.name, type: node.type, childCount: node.children ? node.children.length : 0 }; });",
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    traceId: "cleanup-check",
    capability: "figma-verification",
    operation: { label: "Check temporary sync lab cleanup", kind: "read", phase: "verify", target: `${instance.fileName} / ${instance.pageName}`, postconditions: ["No temporary Control Sync Lab remains"] },
  });
  const matches = Array.isArray(result) ? result : [];
  const removals = [];
  for (const match of matches) {
    const removed = await runtime.call("figma_apply", {
      action: "apply_entity_patch",
      patches: [{ kind: "delete", entityKind: "node", target: { nodeId: match.id }, allowDelete: true }],
      allowDelete: true,
      conflictPolicy: "reject",
      dryRun: true,
      instanceId: instance.instanceId,
      pageId: instance.pageId,
      traceId: `cleanup-check:${match.id}:plan`,
      capability: "figma-native",
      operation: { label: "Plan temporary sync lab cleanup", kind: "write", phase: "plan", target: `${instance.fileName} / ${instance.pageName}`, postconditions: ["Exact temporary node is targeted"] },
    });
    const repeated = await runtime.call("figma_apply", {
      action: "apply_entity_patch",
      patches: [{ kind: "delete", entityKind: "node", target: { nodeId: match.id }, allowDelete: true }],
      allowDelete: true,
      conflictPolicy: "reject",
      dryRun: true,
      instanceId: instance.instanceId,
      pageId: instance.pageId,
      traceId: `cleanup-check:${match.id}:repeat`,
      capability: "figma-native",
      operation: { label: "Repeat temporary sync lab plan", kind: "write", phase: "plan", target: `${instance.fileName} / ${instance.pageName}`, postconditions: ["Repeated plan is stable"] },
    });
    const executed = await runtime.callRaw("figma_apply", {
      action: "apply_entity_patch",
      patches: removed.plan.patches,
      allowDelete: true,
      dryRun: false,
      confirm: true,
      expectedPlanHash: removed.plan.planHash,
      conflictPolicy: "reject",
      instanceId: instance.instanceId,
      pageId: instance.pageId,
      traceId: `cleanup-check:${match.id}:execute`,
      capability: "figma-native",
      operation: { label: "Delete temporary sync lab", kind: "write", phase: "recover", target: `${instance.fileName} / ${instance.pageName}`, postconditions: ["Exact temporary node is removed"] },
    });
    removals.push({ match, planHash: removed.plan?.planHash, repeatPlanHash: repeated.plan?.planHash, before: removed.plan?.before, repeatBefore: repeated.plan?.before, patches: removed.plan?.patches, result: executed });
  }
  process.stdout.write(`${JSON.stringify({ matches, removals, cleaned: matches.length === 0 || removals.length === matches.length })}\n`);
} finally {
  await runtime.close();
}

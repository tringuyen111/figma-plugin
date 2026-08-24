import type { Operation } from "../shared/protocol.js";
import { ErrorCode, OpError } from "./errors.js";
import type { PluginInfo } from "./bridge-protocol.js";

const TYPED_QUERY_KINDS = new Set([
  "artifact_manifest",
  "entity_graph",
  "change_feed",
  "component_integrity",
  "binding_inventory",
  "prototype_graph",
  "motion_snapshot",
  "accessibility_design_facts",
]);

/** Refuse typed work before it reaches the plugin queue when a companion is stale or incomplete. */
export function assertTypedCapability(info: PluginInfo, op: Operation, params: Record<string, unknown>, expectedBundleRevision: string): void {
  const queryKind = op === "query_document" && typeof params.kind === "string" ? params.kind : undefined;
  const applyAction = op === "apply_document" && typeof params.action === "string" ? params.action : undefined;
  const needsCandidate = (queryKind && TYPED_QUERY_KINDS.has(queryKind)) || applyAction === "apply_entity_patch";
  if (!needsCandidate) return;
  if (info.bundleRevision !== expectedBundleRevision) {
    throw new OpError(
      ErrorCode.UNSUPPORTED_OPERATION,
      `Figma instance "${info.instanceId}" has stale bundle revision "${info.bundleRevision}", expected "${expectedBundleRevision}" for the requested typed operation.`,
      "Reload the companion from the rebuilt development manifest before queueing typed graph or patch operations.",
    );
  }
  if (queryKind && !info.features?.queryKinds.includes(queryKind as never)) {
    throw new OpError(ErrorCode.UNSUPPORTED_OPERATION, `Figma instance "${info.instanceId}" does not advertise query kind "${queryKind}".`, "Reload the companion so protocol 10 capability negotiation completes.");
  }
  if (applyAction && !info.features?.applyActions.includes(applyAction as never)) {
    throw new OpError(ErrorCode.UNSUPPORTED_OPERATION, `Figma instance "${info.instanceId}" does not advertise apply action "${applyAction}".`, "Reload the companion so protocol 10 capability negotiation completes.");
  }
}

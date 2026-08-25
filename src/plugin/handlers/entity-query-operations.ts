/// <reference types="@figma/plugin-typings" />
import { fingerprint } from "../../shared/entity-contract.js";
import { ErrorCode, type QueryKind } from "../../shared/protocol.js";
import {
  accessibilityFacts,
  artifactManifest,
  bindingInventory,
  componentIntegrity,
  entityGraph,
  evidenceEnvelope,
  motionSnapshot,
  prototypeGraph,
} from "./entity-evidence.js";
import { failure } from "./entity-operation-support.js";
import {
  changeFeed,
  initializeSync,
  refreshSync,
} from "../sync-engine.js";

export async function queryEntity(kind: QueryKind, params: Record<string, unknown>): Promise<unknown> {
  await initializeSync();
  await refreshSync();
  if (kind === "artifact_manifest") return artifactManifest(params);
  if (kind === "entity_graph") return entityGraph(params);
  if (kind === "change_feed") {
    const feed = changeFeed(typeof params.cursor === "string" ? params.cursor : undefined, params.refresh === true);
    return evidenceEnvelope("change_feed", params, fingerprint(feed), feed, { scope: "document", scanned: Array.isArray(feed.changes) ? feed.changes.length : 0, total: typeof feed.toSeq === "number" ? feed.toSeq : null, returned: Array.isArray(feed.changes) ? feed.changes.length : 0, truncated: false });
  }
  if (kind === "component_integrity") return componentIntegrity(params);
  if (kind === "binding_inventory") return bindingInventory(params);
  if (kind === "prototype_graph") return prototypeGraph(params);
  if (kind === "motion_snapshot") return motionSnapshot(params);
  if (kind === "accessibility_design_facts") return accessibilityFacts(params);
  throw failure(ErrorCode.INVALID_PARAMS, `Unsupported extended query kind "${kind}".`);
}

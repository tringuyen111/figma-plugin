/// <reference types="@figma/plugin-typings" />
import {
  fingerprint,
  type EntityKind,
  type EvidenceCoverageWire,
} from "../shared/entity-contract.js";
import { ErrorCode, type ChangeRecordWire, type SyncStateWire } from "../shared/protocol.js";

const MAX_JOURNAL_ENTRIES = 2_000;
const VARIABLE_SCAN_MS = 5_000;
const CONTROL_NAMESPACE = "figmaplugin";
const CONTROL_KEY = "control";

type SyncListener = (record: ChangeRecordWire) => void;

interface ControlMetadata {
  schemaVersion: 1;
  controlId: string;
  entityKind: EntityKind;
  createdByTraceId?: string;
  forkedFrom?: string;
}

interface RegistryMetadata {
  schemaVersion: 1;
  entities: Record<string, { controlId: string; entityKind: EntityKind; forkedFrom?: string }>;
}

interface RuntimeSyncState {
  initialized: boolean;
  state: SyncStateWire["state"];
  syncEpoch: string;
  changeSeq: number;
  journal: ChangeRecordWire[];
  subscribedPageIds: Set<string>;
  lastRescanAt?: number;
  lastError?: string;
  variableFingerprint?: string;
  listeners: Set<SyncListener>;
  knownControlIds: Map<string, string>;
  activeAgentChanges: Map<string, { entityIds: Set<string>; properties: Set<string> }>;
  documentFingerprint?: string;
}

const runtime: RuntimeSyncState = {
  initialized: false,
  state: "warming",
  syncEpoch: newId("sync"),
  changeSeq: 0,
  journal: [],
  subscribedPageIds: new Set<string>(),
  listeners: new Set<SyncListener>(),
  knownControlIds: new Map<string, string>(),
  activeAgentChanges: new Map<string, { entityIds: Set<string>; properties: Set<string> }>(),
};
let initialization: Promise<void> | null = null;

export const CONTROL_NAMESPACE_KEY = CONTROL_NAMESPACE;

export function registryMetadata(entityId: string): { controlId: string; entityKind: EntityKind; forkedFrom?: string } | null {
  const registry = readRegistry();
  const entry = registry.entities[entityId];
  return entry ? { ...entry } : null;
}

export function findRegistryEntity(controlId: string, entityKind?: EntityKind): { entityId: string; entityKind: EntityKind; forkedFrom?: string } | null {
  const registry = readRegistry();
  for (const [entityId, entry] of Object.entries(registry.entities)) {
    if (entry.controlId === controlId && (!entityKind || entry.entityKind === entityKind)) return { entityId, entityKind: entry.entityKind, ...(entry.forkedFrom ? { forkedFrom: entry.forkedFrom } : {}) };
  }
  return null;
}

export function ensureRegistryId(entityId: string, entityKind: EntityKind, requested?: string, forkedFrom?: string): string {
  const registry = readRegistry();
  const existing = registry.entities[entityId];
  if (existing) return existing.controlId;
  const allocated = allocateFreshControlId(requested);
  registry.entities[entityId] = {
    controlId: allocated.controlId,
    entityKind,
    ...(allocated.forkedFrom ? { forkedFrom: allocated.forkedFrom } : forkedFrom ? { forkedFrom } : {}),
  };
  writeRegistry(registry);
  return allocated.controlId;
}

export function initializeSync(listener?: SyncListener): Promise<void> {
  if (listener) runtime.listeners.add(listener);
  if (initialization) return initialization;
  runtime.initialized = true;
  initialization = (async () => {
    try {
      await figma.loadAllPagesAsync();
      figma.on("documentchange", onDocumentChange);
      figma.on("stylechange", onStyleChange);
      await reconcileControlIds();
      await rescanDocument("initial");
      runtime.state = "ready";
      await rescanVariables().catch((error) => { runtime.lastError = error instanceof Error ? error.message : String(error); });
    } catch (error) {
      runtime.state = "degraded_page_scope";
      runtime.lastError = error instanceof Error ? error.message : String(error);
      try {
        await subscribePage(figma.currentPage);
        await reconcileControlIds();
        await rescanDocument("degraded_page_scope");
        await rescanVariables().catch((error) => { runtime.lastError = error instanceof Error ? error.message : String(error); });
      } catch (fallbackError) {
        runtime.lastError = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      }
    }
    scheduleVariableScan();
  })();
  return initialization;
}

export function subscribeSync(listener: SyncListener): () => void {
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

export async function subscribePage(page: PageNode): Promise<void> {
  if (runtime.state === "ready") return;
  await page.loadAsync();
  if (runtime.subscribedPageIds.has(page.id)) return;
  page.on("nodechange", onNodeChange);
  runtime.subscribedPageIds.add(page.id);
}

export function syncState(): SyncStateWire {
  return {
    state: runtime.state,
    syncEpoch: runtime.syncEpoch,
    changeSeq: runtime.changeSeq,
    unreadChanges: runtime.journal.length,
    subscribedPageIds: [...runtime.subscribedPageIds],
    ...(runtime.lastRescanAt ? { lastRescanAt: runtime.lastRescanAt } : {}),
    ...(runtime.lastError ? { lastError: runtime.lastError } : {}),
  };
}

export function featureLimitations(): Array<{ code: string; message: string; unlock?: string }> {
  const limits: Array<{ code: string; message: string; unlock?: string }> = [];
  if (runtime.state === "degraded_page_scope") limits.push({
    code: "DEGRADED_PAGE_SCOPE",
    message: "Whole-document change events are unavailable; only loaded/subscribed pages are observed.",
    unlock: "Reload the companion with dynamic-page access and allow the initial document scan to complete.",
  });
  if (runtime.state === "resync_required") limits.push({
    code: "RESYNC_REQUIRED",
    message: "The change cursor is no longer contiguous; a fresh artifact scan is required.",
    unlock: "Call artifact_manifest or change_feed with refresh=true.",
  });
  return limits;
}

export function rememberAgentChange(traceId: string, entityIds: string[], properties: string[] = []): void {
  runtime.activeAgentChanges.set(traceId, { entityIds: new Set(entityIds), properties: new Set(properties) });
  setTimeout(() => runtime.activeAgentChanges.delete(traceId), 15_000);
}

export function changeFeed(cursor?: string, refresh = false): Record<string, unknown> {
  void refresh;
  const parsed = parseCursor(cursor);
  if (cursor && !parsed) {
    runtime.state = "resync_required";
    return { ...syncState(), fromSeq: null, toSeq: runtime.changeSeq, changes: [], resyncRequired: true, errorCode: ErrorCode.RESYNC_REQUIRED, limitations: featureLimitations() };
  }
  if (parsed && parsed.epoch !== runtime.syncEpoch) {
    runtime.state = "resync_required";
    return { ...syncState(), changes: [], resyncRequired: true, errorCode: ErrorCode.RESYNC_REQUIRED, limitations: featureLimitations() };
  }
  const fromSeq = parsed?.seq ?? 0;
  const firstSeq = runtime.journal.length ? Number(runtime.journal[0]?.id.split(":").pop()) : runtime.changeSeq;
  if (parsed && parsed.seq < Math.max(0, firstSeq - 1)) {
    runtime.state = "resync_required";
    return { ...syncState(), fromSeq, toSeq: runtime.changeSeq, changes: [], resyncRequired: true, errorCode: ErrorCode.RESYNC_REQUIRED, limitations: featureLimitations() };
  }
  const changes = runtime.journal.filter((record) => record.id.startsWith(`${runtime.syncEpoch}:`) && Number(record.id.split(":").pop()) > fromSeq);
  return {
    ...syncState(),
    fromSeq,
    toSeq: runtime.changeSeq,
    changes,
    nextCursor: encodeCursor(runtime.syncEpoch, runtime.changeSeq),
    resyncRequired: false,
    limitations: featureLimitations(),
  };
}

export async function refreshSync(): Promise<void> {
  try {
    if (runtime.state === "resync_required") {
      runtime.syncEpoch = newId("sync");
      runtime.changeSeq = 0;
      runtime.journal = [];
      runtime.state = "ready";
    }
    await reconcileControlIds();
    await rescanDocument("refresh");
    await rescanVariables();
    runtime.lastRescanAt = Date.now();
  } catch (error) {
    runtime.lastError = error instanceof Error ? error.message : String(error);
  }
}

export function controlMetadata(node: BaseNodeMixin): ControlMetadata | null {
  try {
    const raw = node.getSharedPluginData(CONTROL_NAMESPACE, CONTROL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ControlMetadata>;
    if (parsed.schemaVersion !== 1 || typeof parsed.controlId !== "string" || typeof parsed.entityKind !== "string") return null;
    if (!safeIdentity(parsed.controlId) || !isEntityKind(parsed.entityKind)) return null;
    const metadata: ControlMetadata = { schemaVersion: 1, controlId: parsed.controlId, entityKind: parsed.entityKind, ...(safeIdentity(parsed.createdByTraceId) ? { createdByTraceId: parsed.createdByTraceId } : {}), ...(safeIdentity(parsed.forkedFrom) ? { forkedFrom: parsed.forkedFrom } : {}) };
    runtime.knownControlIds.set(node.id, metadata.controlId);
    return metadata;
  } catch {
    return null;
  }
}

export function ensureControlId(node: BaseNodeMixin, entityKind: EntityKind, requested?: string, traceId?: string): string {
  const existing = controlMetadata(node);
  if (existing) return existing.controlId;
  const allocated = allocateFreshControlId(requested);
  const metadata: ControlMetadata = {
    schemaVersion: 1,
    controlId: allocated.controlId,
    entityKind,
    ...(traceId ? { createdByTraceId: traceId } : {}),
    ...(allocated.forkedFrom ? { forkedFrom: allocated.forkedFrom } : {}),
  };
  node.setSharedPluginData(CONTROL_NAMESPACE, CONTROL_KEY, JSON.stringify(metadata));
  runtime.knownControlIds.set(node.id, allocated.controlId);
  return allocated.controlId;
}

export function assignFreshControlId(node: BaseNodeMixin, entityKind: EntityKind, requested?: string, traceId?: string): string {
  const allocated = allocateFreshControlId(requested);
  const metadata: ControlMetadata = {
    schemaVersion: 1,
    controlId: allocated.controlId,
    entityKind,
    ...(traceId ? { createdByTraceId: traceId } : {}),
    ...(allocated.forkedFrom ? { forkedFrom: allocated.forkedFrom } : {}),
  };
  node.setSharedPluginData(CONTROL_NAMESPACE, CONTROL_KEY, JSON.stringify(metadata));
  runtime.knownControlIds.set(node.id, allocated.controlId);
  return allocated.controlId;
}

function allocateFreshControlId(requested?: string): { controlId: string; forkedFrom?: string } {
  const validRequested = safeIdentity(requested) ? requested : undefined;
  if (validRequested && !controlIdExists(validRequested)) return { controlId: validRequested };
  const controlId = freshGeneratedControlId();
  return validRequested ? { controlId, forkedFrom: validRequested } : { controlId };
}

function freshGeneratedControlId(): string {
  let candidate = newId("entity");
  while (controlIdExists(candidate)) candidate = newId("entity");
  return candidate;
}

function controlIdExists(controlId: string): boolean {
  return Boolean(findControlId(controlId) ?? findRegistryEntity(controlId));
}

export function findControlId(controlId: string): SceneNode | null {
  try {
    const pages = figma.root.children.filter((node): node is PageNode => node.type === "PAGE");
    let first: SceneNode | null = null;
    for (const page of pages) {
      const matches = page.findAllWithCriteria({ sharedPluginData: { namespace: CONTROL_NAMESPACE, keys: [CONTROL_KEY] } });
      for (const node of matches) {
        const metadata = controlMetadata(node);
        if (metadata?.controlId !== controlId || !isSceneNode(node)) continue;
        if (!first) {
          first = node;
          continue;
        }
        const fresh = newId("entity");
        node.setSharedPluginData(CONTROL_NAMESPACE, CONTROL_KEY, JSON.stringify({ ...metadata, controlId: fresh, forkedFrom: controlId }));
        runtime.knownControlIds.set(node.id, fresh);
      }
    }
    if (first) return first;
  } catch {
    return null;
  }
  return null;
}

function isSceneNode(value: BaseNodeMixin): value is SceneNode {
  return "type" in value && value.type !== "PAGE" && value.type !== "DOCUMENT";
}

export function encodeCursor(epoch = runtime.syncEpoch, seq = runtime.changeSeq): string {
  return `${epoch}:${seq}`;
}

export function coverage(scope: EvidenceCoverageWire["scope"], scanned: number, total: number | null, returned: number, truncated: boolean, nextCursor?: string): EvidenceCoverageWire {
  return { scope, scanned, total, returned, truncated, ...(nextCursor ? { nextCursor } : {}) };
}

function parseCursor(cursor?: string): { epoch: string; seq: number } | null {
  if (!cursor) return null;
  const separator = cursor.lastIndexOf(":");
  if (separator <= 0) return null;
  const epoch = cursor.slice(0, separator);
  const seq = Number(cursor.slice(separator + 1));
  return epoch && Number.isInteger(seq) && seq >= 0 ? { epoch, seq } : null;
}

function onDocumentChange(event: DocumentChangeEvent): void {
  for (const change of event.documentChanges) {
    const node = "node" in change ? change.node : null;
    const entityId = typeof change.id === "string" ? change.id : "unknown";
    const metadata = node && !isRemovedNode(node) ? controlMetadata(node) : null;
    const controlId = metadata?.controlId ?? runtime.knownControlIds.get(entityId);
    const properties = "properties" in change && Array.isArray(change.properties) ? change.properties.map(String) : [];
    appendChange({
      type: change.type,
      origin: "origin" in change ? change.origin : "UNKNOWN",
      actor: actorFor(entityId, properties, metadata?.createdByTraceId, "origin" in change ? change.origin : "UNKNOWN"),
      entityKind: node && !isRemovedNode(node) ? entityKindFor(node) : "unknown",
      entityId,
      ...(controlId ? { controlId } : {}),
      ...(properties.length ? { properties } : {}),
      ...(actorFor(entityId, properties, metadata?.createdByTraceId, "origin" in change ? change.origin : "UNKNOWN") === "agent" ? { traceId: matchingTrace(entityId, properties, metadata?.createdByTraceId) } : {}),
      observedAt: Date.now(),
    });
  }
}

function onNodeChange(event: NodeChangeEvent): void {
  for (const change of event.nodeChanges) {
    const node = "node" in change ? change.node : null;
    const entityId = typeof change.id === "string" ? change.id : "unknown";
    const metadata = node && !isRemovedNode(node) ? controlMetadata(node) : null;
    const controlId = metadata?.controlId ?? runtime.knownControlIds.get(entityId);
    const properties = "properties" in change && Array.isArray(change.properties) ? change.properties.map(String) : [];
    appendChange({
      type: change.type,
      origin: "origin" in change ? change.origin : "UNKNOWN",
      actor: actorFor(entityId, properties, metadata?.createdByTraceId, "origin" in change ? change.origin : "UNKNOWN"),
      entityKind: node && !isRemovedNode(node) ? entityKindFor(node) : "unknown",
      entityId,
      ...(controlId ? { controlId } : {}),
      ...(properties.length ? { properties } : {}),
      observedAt: Date.now(),
    });
  }
}

function onStyleChange(event: StyleChangeEvent): void {
  for (const change of event.styleChanges) {
    const properties = (change as unknown as { properties?: unknown }).properties;
    appendChange({
      type: change.type,
      origin: change.origin,
      actor: actorFor(change.id, Array.isArray(properties) ? properties.map(String) : [], undefined, change.origin),
      entityKind: "style",
      entityId: change.id,
      ...(Array.isArray(properties) ? { properties: properties.map(String) } : {}),
      observedAt: Date.now(),
    });
  }
}

function appendChange(change: Omit<ChangeRecordWire, "id">): void {
  const previous = runtime.journal[runtime.journal.length - 1];
  const properties = [...(change.properties ?? [])].sort().join(",");
  if (previous && previous.entityId === change.entityId && previous.type === change.type && [...(previous.properties ?? [])].sort().join(",") === properties && change.observedAt - previous.observedAt <= 50) return;
  runtime.changeSeq += 1;
  const record = { ...change, id: `${runtime.syncEpoch}:${runtime.changeSeq}` };
  runtime.journal.push(record);
  if (runtime.journal.length > MAX_JOURNAL_ENTRIES) runtime.journal.splice(0, runtime.journal.length - MAX_JOURNAL_ENTRIES);
  for (const listener of runtime.listeners) listener(record);
}

function actorFor(entityId: string, properties: string[], metadataTraceId?: string, origin?: string): ChangeRecordWire["actor"] {
  if (metadataTraceId && runtime.activeAgentChanges.has(metadataTraceId)) return "agent";
  for (const [traceId, change] of runtime.activeAgentChanges) {
    if (change.entityIds.has(entityId) && (properties.length === 0 || properties.some((property) => change.properties.has(property)))) return "agent";
    if (change.entityIds.has(entityId) && change.properties.size === 0) return "agent";
    if (traceId === entityId) return "agent";
  }
  return origin === "REMOTE" ? "remote" : "external_local";
}

function matchingTrace(entityId: string, properties: string[], metadataTraceId?: string): string | undefined {
  if (metadataTraceId && runtime.activeAgentChanges.has(metadataTraceId)) return metadataTraceId;
  for (const [traceId, change] of runtime.activeAgentChanges) {
    if (change.entityIds.has(entityId) && (change.properties.size === 0 || properties.some((property) => change.properties.has(property)))) return traceId;
  }
  return undefined;
}

async function rescanVariables(): Promise<void> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const next = fingerprint({
    collections: collections.map((collection) => ({ id: collection.id, key: collection.key, name: collection.name, modes: collection.modes, variableIds: collection.variableIds })),
    variables: variables.map((variable) => ({ id: variable.id, key: variable.key, name: variable.name, resolvedType: variable.resolvedType, collectionId: variable.variableCollectionId, values: safeJson((variable as unknown as { valuesByMode?: unknown }).valuesByMode) })),
  });
  if (runtime.variableFingerprint && runtime.variableFingerprint !== next) {
    appendChange({ type: "RESCAN", origin: "UNKNOWN", actor: "rescan", entityKind: "variable", entityId: "variables", properties: ["values", "modes", "collections"], observedAt: Date.now() });
  }
  runtime.variableFingerprint = next;
  runtime.lastRescanAt = Date.now();
}

async function rescanDocument(reason: string): Promise<void> {
  const pages = figma.root.children.filter((node): node is PageNode => node.type === "PAGE");
  const nodes: Array<Record<string, unknown>> = [];
  for (const page of pages) {
    if (runtime.state === "degraded_page_scope" && page.id !== figma.currentPage.id) continue;
    await page.loadAsync();
    for (const node of page.findAll(() => true)) {
      const metadata = controlMetadata(node);
      nodes.push({ id: node.id, type: node.type, name: node.name, pageId: page.id, parentId: node.parent?.id ?? null, index: node.parent && "children" in node.parent ? node.parent.children.indexOf(node) : null, controlId: metadata?.controlId ?? null });
    }
  }
  const next = fingerprint({ pages: pages.map((page) => ({ id: page.id, name: page.name })), nodes });
  if (runtime.documentFingerprint && runtime.documentFingerprint !== next && reason !== "initial") {
    appendChange({ type: "RESCAN", origin: "UNKNOWN", actor: "rescan", entityKind: "node", entityId: "document", properties: ["structure"], observedAt: Date.now() });
  }
  runtime.documentFingerprint = next;
  runtime.lastRescanAt = Date.now();
}

async function reconcileControlIds(): Promise<void> {
  const seen = new Map<string, string>();
  const pages = figma.root.children.filter((node): node is PageNode => node.type === "PAGE");
  for (const page of pages) {
    if (runtime.state === "degraded_page_scope" && page.id !== figma.currentPage.id) continue;
    await page.loadAsync();
    for (const node of page.findAll(() => true)) {
      const metadata = controlMetadata(node);
      if (!metadata) continue;
      if (!seen.has(metadata.controlId)) {
        seen.set(metadata.controlId, node.id);
        continue;
      }
      const fresh = newId("entity");
      node.setSharedPluginData(CONTROL_NAMESPACE, CONTROL_KEY, JSON.stringify({ ...metadata, controlId: fresh, forkedFrom: metadata.controlId }));
      runtime.knownControlIds.set(node.id, fresh);
    }
  }
}

function scheduleVariableScan(): void {
  const timer = setTimeout(async () => {
    if (runtime.initialized) {
      await rescanVariables().catch((error) => { runtime.lastError = error instanceof Error ? error.message : String(error); });
      scheduleVariableScan();
    }
  }, VARIABLE_SCAN_MS);
  // Node-based bundle smoke must be able to exit; Figma's browser timer has no unref method.
  (timer as unknown as { unref?: () => void }).unref?.();
}

function entityKindFor(node: SceneNode): EntityKind {
  if (node.type === "INSTANCE" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") return "node";
  return "node";
}

function isRemovedNode(node: SceneNode | RemovedNode): node is RemovedNode {
  return "removed" in node && node.removed === true;
}

function newId(prefix: string): string {
  const random = () => Math.floor(Math.random() * 0x100000000).toString(36).padStart(6, "0");
  return `${prefix}-${Date.now().toString(36)}-${random()}${random()}`;
}

function readRegistry(): RegistryMetadata {
  try {
    const root = figma.root as unknown as BaseNodeMixin;
    const raw = root.getSharedPluginData(CONTROL_NAMESPACE, "entity-registry");
    const parsed = raw ? JSON.parse(raw) as Partial<RegistryMetadata> : null;
    if (parsed?.schemaVersion === 1 && parsed.entities && typeof parsed.entities === "object") {
      const entities: RegistryMetadata["entities"] = {};
      for (const [entityId, value] of Object.entries(parsed.entities as Record<string, unknown>)) {
        if (!value || typeof value !== "object") continue;
        const entry = value as Record<string, unknown>;
        if (!safeIdentity(entry.controlId) || !isEntityKind(entry.entityKind)) continue;
        entities[entityId] = { controlId: entry.controlId, entityKind: entry.entityKind, ...(safeIdentity(entry.forkedFrom) ? { forkedFrom: entry.forkedFrom } : {}) };
      }
      return { schemaVersion: 1, entities };
    }
  } catch {
    // A provider without shared plugin data remains usable for node CRUD.
  }
  return { schemaVersion: 1, entities: {} };
}

function safeIdentity(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value); }
function isEntityKind(value: unknown): value is EntityKind { return value === "node" || value === "style" || value === "variable" || value === "variable_collection"; }

function writeRegistry(registry: RegistryMetadata): void {
  try {
    const entries = Object.entries(registry.entities);
    if (entries.length > 10_000) entries.splice(0, entries.length - 10_000);
    const entities: RegistryMetadata["entities"] = {};
    for (const [id, entry] of entries) entities[id] = entry;
    (figma.root as unknown as BaseNodeMixin).setSharedPluginData(CONTROL_NAMESPACE, "entity-registry", JSON.stringify({ schemaVersion: 1, entities }));
  } catch {
    // Provider-gated registry support is surfaced as a missing controlId/readback limitation.
  }
}

function safeJson(value: unknown): unknown {
  try { return value === undefined ? null : JSON.parse(JSON.stringify(value)); }
  catch { return null; }
}

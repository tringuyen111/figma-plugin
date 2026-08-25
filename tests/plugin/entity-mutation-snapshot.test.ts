import { describe, expect, it } from "vitest";
import {
  mutationSnapshotEntry,
  mutationSnapshotFingerprint,
  mutationSnapshotsEqual,
} from "../../src/plugin/handlers/entity-mutation-snapshot.js";
import type { EntityPatchWire } from "../../src/shared/entity-contract.js";

describe("entity mutation snapshots", () => {
  it("ignores evidence-only projection fields but changes for mutable state", () => {
    const patch = { kind: "update", entityKind: "node", target: { nodeId: "1:2" }, set: { x: 24 } } as EntityPatchWire;
    const target = { id: "1:2", type: "FRAME", name: "Card", x: 0, parent: null } as unknown as SceneNode;
    const first = mutationSnapshotEntry(patch, target, { controlId: "stable-card" }, ["x"]);
    const evidenceOnlyChange = mutationSnapshotEntry(patch, target, { controlId: "stable-card" }, ["x"]);

    expect(mutationSnapshotFingerprint([evidenceOnlyChange])).toBe(mutationSnapshotFingerprint([first]));
    expect(mutationSnapshotsEqual([first], [evidenceOnlyChange])).toBe(true);

    target.x = 1;
    const mutableChange = mutationSnapshotEntry(patch, target, { controlId: "stable-card" }, ["x"]);
    expect(mutationSnapshotFingerprint([mutableChange])).not.toBe(mutationSnapshotFingerprint([first]));
  });

  it("reads a requested property directly even when the evidence projection omits it", () => {
    const patch = { kind: "update", entityKind: "node", target: { nodeId: "1:2" }, set: { cornerRadius: 12 } } as unknown as EntityPatchWire;
    const target = { id: "1:2", type: "RECTANGLE", cornerRadius: 8, parent: null } as unknown as SceneNode;
    const snapshot = mutationSnapshotEntry(patch, target, {}, ["cornerRadius"]);

    expect(snapshot.cornerRadius).toBe(8);
  });

  it("tracks destination insertion context independently from target evidence", () => {
    const patch = { kind: "create", entityKind: "node", entityType: "FRAME", index: 1 } as EntityPatchWire;
    const first = mutationSnapshotEntry(patch, undefined, {
      preflight: { operation: "create", entityType: "FRAME" },
      destination: { id: "page:1", childIds: ["1:1", "1:2"], requestedIndex: 1 },
    }, []);
    const siblingDrift = mutationSnapshotEntry(patch, undefined, {
      preflight: { operation: "create", entityType: "FRAME" },
      destination: { id: "page:1", childIds: ["1:0", "1:1", "1:2"], requestedIndex: 1 },
    }, []);

    expect(mutationSnapshotFingerprint([siblingDrift])).not.toBe(mutationSnapshotFingerprint([first]));
  });
});

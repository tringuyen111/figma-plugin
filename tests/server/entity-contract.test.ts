import { describe, expect, it } from "vitest";
import { fingerprint, validateEntityPatch, validateEntityPatches, validateEntityRef } from "../../src/shared/entity-contract.js";

describe("typed entity contract", () => {
  it("requires exactly one stable target identity", () => {
    expect(validateEntityRef({ nodeId: "1:2", expectedType: "FRAME" })).toEqual({ nodeId: "1:2", expectedType: "FRAME" });
    expect(() => validateEntityRef({ nodeId: "1:2", styleId: "S:1" })).toThrow(/exactly one identity/);
    expect(() => validateEntityRef({ nodeId: "" })).toThrow(/exactly one identity/);
  });

  it("validates bounded CRUD patches and rejects unsupported patch kinds", () => {
    expect(validateEntityPatch({ kind: "create", entityKind: "node", entityType: "FRAME", properties: { name: "Sync Lab", width: 320 } })).toMatchObject({ kind: "create", entityKind: "node" });
    expect(validateEntityPatch({ kind: "update", entityKind: "node", target: { nodeId: "1:2" }, set: { visible: false } })).toMatchObject({ kind: "update" });
    expect(validateEntityPatches([{ kind: "delete", entityKind: "node", target: { controlId: "entity-12345678" }, allowDelete: true }])).toHaveLength(1);
    expect(() => validateEntityPatch({ kind: "unknown", entityKind: "node" })).toThrow(/kind must be one of/);
  });

  it("produces stable plan fingerprints independent of object key order", () => {
    expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});

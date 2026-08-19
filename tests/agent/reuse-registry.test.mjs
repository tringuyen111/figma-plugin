import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateReuseRegistry } from "../../skills/figma-components/scripts/validate-reuse-registry.mjs";

const registry = JSON.parse(readFileSync(new URL("../../output/figma-evidence/reuse-registry.json", import.meta.url), "utf8"));

describe("Figma reuse registry", () => {
  it("preserves local proof and explicit cross-file NOT_RUN", () => {
    expect(validateReuseRegistry(registry)).toEqual([]);
    expect(registry.assets.find((asset) => asset.identityState === "LOCAL_VERIFIED").consumers).toHaveLength(4);
    expect(registry.assets.find((asset) => asset.registryKey.includes("published-library")).verification.state).toBe("NOT_RUN");
  });

  it("rejects false published proof and detached local consumers", () => {
    const invalid = structuredClone(registry);
    const local = invalid.assets[0];
    local.consumers[0].linkState = "DETACHED";
    const crossFile = invalid.assets[1];
    crossFile.identityState = "LIBRARY_IMPORTED_VERIFIED";
    crossFile.verification.state = "PASS";
    crossFile.verification.evidence = ["invented"];
    expect(validateReuseRegistry(invalid)).toEqual(expect.arrayContaining([
      "asset 0 LOCAL_VERIFIED consumers must link to source.nodeId",
      "asset 1 LIBRARY_IMPORTED_VERIFIED requires published source, PASS, and a linked consumer",
    ]));
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATIONS } from "../../src/shared/protocol.js";

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split(/\r?\n/).length;
}

describe("native-only production surface", () => {
  it("keeps one native execution operation plus typed artifact egress", () => {
    expect(OPERATIONS).toEqual(["execute_js", "query_document", "apply_document", "export_node"]);
  });

  it("keeps server ownership split instead of regrowing entrypoint/bridge monoliths", () => {
    for (const rel of [
      "server/runtime.ts",
      "server/mcp-surface.ts",
      "server/bridge.ts",
      "server/plugin-connection.ts",
      "server/bridge-protocol.ts",
      "server/request-telemetry.ts",
      "server/runtime-telemetry.ts",
      "capabilities/skill-registry.ts",
    ]) {
      expect(existsSync(join(sourceRoot, rel))).toBe(true);
    }

    expect(lineCount(join(sourceRoot, "server/index.ts"))).toBeLessThanOrEqual(80);
    expect(lineCount(join(sourceRoot, "server/bridge.ts"))).toBeLessThanOrEqual(500);
    expect(lineCount(join(sourceRoot, "server/plugin-connection.ts"))).toBeLessThanOrEqual(280);
  });
});

import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { baseDir, leaderFilePathFor } from "../../src/server/paths.js";

describe("runtime paths", () => {
  it("uses a Figma Plugin per-user runtime directory", () => {
    const env = { XDG_RUNTIME_DIR: "/tmp/cmx-test" };
    const expectedDir = resolve(env.XDG_RUNTIME_DIR, "figma-plugin");
    expect(baseDir(env)).toBe(expectedDir);
    expect(leaderFilePathFor(38470, env)).toBe(join(expectedDir, "leader-38470.json"));
  });
});

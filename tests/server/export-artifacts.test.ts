import { describe, expect, it } from "vitest";
import { lstat, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { persistExportArtifact, resolveExportDir } from "../../src/server/export-artifacts.js";

function mode(statMode: number): number { return statMode & 0o777; }

describe("export artifact persistence", () => {
  it("persists typed bytes without returning them to model context", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    const result = await persistExportArtifact(
      { format: "SVG", bytes: new Uint8Array(Buffer.from("<svg/>")) , nodeId: "1:2", nodeName: "Icon" },
      "icon.svg",
      { CONTROLMUX_FIGMA_EXPORT_DIR: dir },
    );
    expect(result.artifact.format).toBe("SVG");
    expect(result.artifact.mimeType).toBe("image/svg+xml");
    expect(result.artifact.path).toBe(join(dir, "icon.svg"));
    expect(result.artifact.retention).toBe("user-managed");
    expect((await readFile(result.artifact.path)).toString("utf8")).toBe("<svg/>");
    expect(result).not.toHaveProperty("bytes");
    if (process.platform !== "win32") expect(mode((await lstat(result.artifact.path)).mode)).toBe(0o600);
  });

  it("does not overwrite a prior explicit filename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    const payload = { format: "PNG", bytes: new Uint8Array([1,2,3]), nodeName: "Frame" };
    const first = await persistExportArtifact(payload, "frame.png", { CONTROLMUX_FIGMA_EXPORT_DIR: dir });
    const second = await persistExportArtifact(payload, "frame.png", { CONTROLMUX_FIGMA_EXPORT_DIR: dir });
    expect(first.artifact.filename).toBe("frame.png");
    expect(second.artifact.filename).toBe("frame-2.png");
  });

  it("uses a private ephemeral runtime directory by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "controlmux-runtime-test-"));
    const env = { XDG_RUNTIME_DIR: root };
    const result = await persistExportArtifact(
      { format: "PNG", bytes: new Uint8Array([1,2,3]), nodeName: "Icon / Add" },
      undefined,
      env,
    );
    expect(result.artifact.filename).toBe("Icon - Add.png");
    expect(result.artifact.retention).toBe("ephemeral-24h");
    expect(result.artifact.path.startsWith(resolveExportDir(env))).toBe(true);
    if (process.platform !== "win32") {
      expect(mode((await lstat(resolveExportDir(env))).mode)).toBe(0o700);
      expect(mode((await lstat(result.artifact.path)).mode)).toBe(0o600);
    }
  });

  it("rejects a configured export directory that is a symlink", async () => {
    if (process.platform === "win32") return;
    const root = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    const real = join(root, "real");
    const link = join(root, "link");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(real));
    await symlink(real, link, "dir");
    await expect(persistExportArtifact(
      { format: "PNG", bytes: new Uint8Array([1]), nodeName: "Frame" },
      undefined,
      { CONTROLMUX_FIGMA_EXPORT_DIR: link },
    )).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("never follows an explicit filename outside the export directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    await writeFile(join(dir, "sentinel"), "ok");
    await expect(persistExportArtifact(
      { format: "PNG", bytes: new Uint8Array([1]), nodeName: "Frame" },
      "../escape.png",
      { CONTROLMUX_FIGMA_EXPORT_DIR: dir },
    )).rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });
});

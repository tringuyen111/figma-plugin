import { describe, expect, it } from "vitest";
import { lstat, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { persistExportArtifact, resolveExportDir } from "../../src/server/export-artifacts.js";

function mode(statMode: number): number { return statMode & 0o777; }

function pngWithDimensions(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

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
    expect(result.artifact.sha256).toBe("d4dc56669143034f31aa309635d4113d9ad76a02b1739da22c965ed2049be9e6");
    expect(result.artifact.path).toBe(join(dir, "icon.svg"));
    expect(result.artifact.retention).toBe("user-managed");
    expect((await readFile(result.artifact.path)).toString("utf8")).toBe("<svg/>");
    expect(result).not.toHaveProperty("bytes");
    if (process.platform !== "win32") expect(mode((await lstat(result.artifact.path)).mode)).toBe(0o600);
  });

  it("does not overwrite a prior explicit filename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    const payload = { format: "PNG", bytes: pngWithDimensions(2, 2), nodeName: "Frame" };
    const first = await persistExportArtifact(payload, "frame.png", { CONTROLMUX_FIGMA_EXPORT_DIR: dir });
    const second = await persistExportArtifact(payload, "frame.png", { CONTROLMUX_FIGMA_EXPORT_DIR: dir });
    expect(first.artifact.filename).toBe("frame.png");
    expect(second.artifact.filename).toBe("frame-2.png");
  });

  it("reports actual PNG pixel dimensions from IHDR", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    const result = await persistExportArtifact(
      { format: "PNG", bytes: pngWithDimensions(820, 390), nodeName: "Balance Card", naturalWidth: 820, naturalHeight: 390 },
      "balance-card.png",
      { CONTROLMUX_FIGMA_EXPORT_DIR: dir },
    );
    expect(result.artifact).toMatchObject({
      naturalWidth: 820,
      naturalHeight: 390,
      actualPixelWidth: 820,
      actualPixelHeight: 390,
    });
  });

  it("rejects a 1x1 PNG for a materially larger node before writing an artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    await expect(persistExportArtifact(
      { format: "PNG", bytes: pngWithDimensions(1, 1), nodeName: "Balance Card", naturalWidth: 820, naturalHeight: 390 },
      "balance-card.png",
      { CONTROLMUX_FIGMA_EXPORT_DIR: dir },
    )).rejects.toMatchObject({
      code: "INTERNAL",
      message: expect.stringMatching(/returned a 1x1 PNG.*reports 820x390.*not persisted/),
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it("allows a genuine 1x1 node export while exposing its actual pixels", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    const result = await persistExportArtifact(
      { format: "PNG", bytes: pngWithDimensions(1, 1), nodeName: "Pixel", naturalWidth: 1, naturalHeight: 1 },
      "pixel.png",
      { CONTROLMUX_FIGMA_EXPORT_DIR: dir },
    );
    expect(result.artifact).toMatchObject({ actualPixelWidth: 1, actualPixelHeight: 1 });
  });

  it("rejects malformed PNG bytes before writing an artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    await expect(persistExportArtifact(
      { format: "PNG", bytes: new Uint8Array([1, 2, 3]), nodeName: "Frame", naturalWidth: 200, naturalHeight: 100 },
      "frame.png",
      { CONTROLMUX_FIGMA_EXPORT_DIR: dir },
    )).rejects.toMatchObject({ code: "INTERNAL", message: expect.stringMatching(/malformed PNG bytes.*not persisted/) });
    expect(await readdir(dir)).toEqual([]);
  });

  it("uses a private ephemeral runtime directory by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "controlmux-runtime-test-"));
    const env = { XDG_RUNTIME_DIR: root };
    const result = await persistExportArtifact(
      { format: "PNG", bytes: pngWithDimensions(24, 24), nodeName: "Icon / Add" },
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
      { format: "PNG", bytes: pngWithDimensions(2, 2), nodeName: "Frame" },
      undefined,
      { CONTROLMUX_FIGMA_EXPORT_DIR: link },
    )).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("never follows an explicit filename outside the export directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "controlmux-export-test-"));
    await writeFile(join(dir, "sentinel"), "ok");
    await expect(persistExportArtifact(
      { format: "PNG", bytes: pngWithDimensions(2, 2), nodeName: "Frame" },
      "../escape.png",
      { CONTROLMUX_FIGMA_EXPORT_DIR: dir },
    )).rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });
});

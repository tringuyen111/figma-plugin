import { tmpdir } from "node:os";
import { resolve } from "node:path";

export function baseDir(env: NodeJS.ProcessEnv = process.env): string {
  const root = env["XDG_RUNTIME_DIR"] || tmpdir();
  return resolve(root, "figma-plugin");
}

export function leaderFilePathFor(port: number, env: NodeJS.ProcessEnv = process.env): string {
  return resolve(baseDir(env), `leader-${port}.json`);
}

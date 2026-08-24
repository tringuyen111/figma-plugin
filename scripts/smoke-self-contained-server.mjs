import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RuntimeClient, assert } from "./lib/runtime-client.mjs";

const directory = await mkdtemp(join(tmpdir(), "figma-plugin-packed-server-"));
const serverPath = join(directory, "server.mjs");
const runtime = new RuntimeClient({ name: "figma-plugin-self-contained-smoke", serverPath, cwd: directory });

try {
  await copyFile(resolve("dist/server/index.js"), serverPath);
  await runtime.connect();
  const listed = await runtime.listTools();
  const names = listed.tools.map((tool) => tool.name);
  assert(JSON.stringify(names) === JSON.stringify(["figma_status", "figma_query", "figma_apply", "figma_exec", "figma_export"]), `Unexpected standalone tools: ${names.join(", ")}`);
  const status = await runtime.status(false);
  assert(typeof status.pluginConnected === "boolean", "Standalone bundle returned an invalid Figma companion state.");
  // A desktop Figma companion may reconnect while this isolated server is alive.
  // That is ambient runtime state, not a bundle failure; the smoke proves the
  // copied server can start and expose its full MCP contract in either state.
  process.stdout.write(`${JSON.stringify({ selfContainedServer: "PASS", tools: names, pluginConnected: status.pluginConnected })}\n`);
} finally {
  await runtime.close();
  await rm(directory, { recursive: true, force: true });
}

import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildDoctorReport, formatDoctorReport } from "./doctor.js";
import { createServer } from "./runtime.js";

export { createServer, resolveStartPort, type ServerHandle } from "./runtime.js";
export { toolDefinitions, toToolError, toToolResult } from "./mcp-surface.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "doctor") {
    const report = buildDoctorReport();
    const json = process.argv.slice(3).includes("--json");
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${formatDoctorReport(report)}\n`);
    if (report.status !== "READY") process.exitCode = 1;
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write([
      "Figma Plugin",
      "",
      "Usage:",
      "  figma-plugin                 Start the MCP server over stdio",
      "  figma-plugin doctor          Verify local setup and print the exact Figma import steps",
      "  figma-plugin doctor --json   Print the same doctor report as structured JSON",
      "",
    ].join("\n"));
    return;
  }
  if (command) {
    process.stderr.write(`Unknown command "${command}". Run figma-plugin --help.\n`);
    process.exitCode = 2;
    return;
  }

  const handle = await createServer();
  const transport = new StdioServerTransport();
  await handle.server.connect(transport);
  const shutdown = async () => { try { await handle.close(); } finally { process.exit(0); } };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isMain = (() => {
  try { return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (isMain) void main();

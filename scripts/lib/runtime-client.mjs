import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Shared local MCP client for project recipes and live probes.
 * It owns transport, response decoding, and target selection only.
 * Domain mutation policy remains in each recipe.
 */
export class RuntimeClient {
  constructor({ name, version = "1.0.0", serverPath = resolve("dist/server/index.js"), cwd = process.cwd(), env }) {
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd,
      stderr: "pipe",
      ...(env ? { env } : {}),
    });
    this.client = new Client({ name, version }, { capabilities: {} });
    this.connected = false;
  }

  async connect() {
    await this.client.connect(this.transport);
    this.connected = true;
    return this;
  }

  async close() {
    if (!this.connected) return;
    this.connected = false;
    await this.transport.close();
  }

  async listTools() {
    return this.client.listTools();
  }

  async callRaw(name, arguments_, timeout = 150_000) {
    return this.client.callTool({ name, arguments: arguments_ }, undefined, { timeout });
  }

  async call(name, arguments_, timeout = 150_000) {
    const result = await this.callRaw(name, arguments_, timeout);
    const payload = textPayload(result);
    if (result.isError) {
      throw new Error(`${name} failed: ${payload.code || "UNKNOWN"}: ${payload.message || JSON.stringify(payload)}`);
    }
    return payload;
  }

  async status(verbose = true) {
    return this.call("figma_status", { verbose }, 20_000);
  }

  resolveSingleInstance(status, requestedInstanceId) {
    const instances = Array.isArray(status.instances) ? status.instances : [];
    const instance = requestedInstanceId
      ? instances.find((candidate) => candidate.instanceId === requestedInstanceId)
      : instances.length === 1 ? instances[0] : undefined;
    assert(status.pluginConnected === true, "No Figma companion is connected.");
    assert(instance, requestedInstanceId
      ? `Connected instance ${requestedInstanceId} was not found.`
      : `Expected exactly one connected Figma instance; found ${instances.length}. Pass --instance-id when more than one window is connected.`);
    return instance;
  }
}

export function textPayload(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") return {};
  try { return JSON.parse(text); } catch { return { text }; }
}

export function readOption(name) {
  const prefix = `${name}=`;
  const item = process.argv.find((argument) => argument.startsWith(prefix));
  return item ? item.slice(prefix.length) : undefined;
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

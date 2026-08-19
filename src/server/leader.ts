import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { Bridge } from "./bridge.js";
import { DEFAULT_PORT, PORT_RANGE, type LeaderInfo } from "../shared/protocol.js";
import { baseDir, leaderFilePathFor } from "./paths.js";
import { VERSION } from "./version.js";
import { ErrorCode, OpError } from "./errors.js";
import { Follower } from "./follower.js";

export type Role = "leader" | "follower";

export type RunValidated = (
  op: string,
  params: Record<string, unknown>,
  sessionId?: string,
  instanceId?: string,
  pageId?: string,
) => Promise<unknown>;

export interface CoordinatorDeps {
  runValidated: RunValidated;
  onBridgeCreated?: (bridge: Bridge) => void;
  healthIntervalMs?: [number, number];
  startPort?: number;
}

const MAX_ELECTION_ROUNDS = 5;
const CLAIM_SETTLE_MS = 100;
const CLAIM_SETTLE_ATTEMPTS = 10;

export class Coordinator {
  role: Role = "leader";
  bridge?: Bridge;
  follower?: Follower;

  private activeInfo?: LeaderInfo;
  private monitor?: NodeJS.Timeout;
  private stopped = false;
  private lifecycleGeneration = 0;

  constructor(private readonly deps: CoordinatorDeps) {}

  async start(): Promise<Role> {
    this.stopped = false;
    const generation = ++this.lifecycleGeneration;
    this.stopMonitor();
    return this.startGeneration(generation);
  }

  private async startGeneration(generation: number): Promise<Role> {
    for (let round = 0; round < MAX_ELECTION_ROUNDS; round++) {
      if (!this.isActive(generation)) throw new Error("Figma Plugin coordinator was stopped during leader election.");
      const role = await this.electOnce(generation);
      if (role) return role;
      await sleep(150 + round * 100);
    }
    if (!this.isActive(generation)) throw new Error("Figma Plugin coordinator was stopped during leader election.");
    throw new Error(`Figma Plugin could not claim or follow a local bridge after ${MAX_ELECTION_ROUNDS} rounds.`);
  }

  private async electOnce(generation: number): Promise<Role | undefined> {
    const startPort = this.deps.startPort ?? DEFAULT_PORT;
    for (const port of candidatePorts(startPort)) {
      if (!this.isActive(generation)) return undefined;

      if (await this.attachFollower(port, generation)) return "follower";

      const bridge = new Bridge({
        onRpc: (op, params, sessionId, instanceId, pageId) =>
          this.deps.runValidated(op, params, sessionId, instanceId, pageId),
      });
      const token = randomBytes(24).toString("hex");
      try {
        await bridge.listen(port, token);
        if (!this.isActive(generation)) {
          await bridge.close().catch(() => {});
          return undefined;
        }
      } catch (cause) {
        await bridge.close().catch(() => {});
        if (!addressInUse(cause)) throw cause;

        // A sibling process may have bound the port before publishing its
        // leader file. Give it a bounded window to finish the claim. If no
        // valid leader appears, treat the port as owned by an unrelated app.
        if (await this.waitForLeader(port, generation)) return "follower";
        continue;
      }

      const info: LeaderInfo = {
        port,
        token,
        pid: process.pid,
        startedAt: Date.now(),
        version: VERSION,
      };
      try {
        await publishLeader(info);
      } catch (cause) {
        await bridge.close().catch(() => {});
        throw cause;
      }
      if (!this.isActive(generation)) {
        await bridge.close().catch(() => {});
        await removeIfSameLeader(info).catch(() => {});
        return undefined;
      }

      this.role = "leader";
      this.bridge = bridge;
      this.follower = undefined;
      this.activeInfo = info;
      this.stopMonitor();
      this.deps.onBridgeCreated?.(bridge);
      return "leader";
    }
    return undefined;
  }

  private async waitForLeader(port: number, generation: number): Promise<boolean> {
    for (let attempt = 0; attempt < CLAIM_SETTLE_ATTEMPTS; attempt++) {
      if (!this.isActive(generation)) return false;
      if (await this.attachFollower(port, generation)) return true;
      await sleep(CLAIM_SETTLE_MS);
    }
    return false;
  }

  private async attachFollower(port: number, generation: number): Promise<boolean> {
    const info = await readLeader(port);
    if (!info || info.port !== port || !info.token) return false;
    if (!(await Follower.checkHealth(info))) return false;
    if (!this.isActive(generation)) return false;
    this.role = "follower";
    this.bridge = undefined;
    this.follower = new Follower(info);
    this.activeInfo = undefined;
    this.startMonitor();
    return true;
  }

  async forward(
    op: string,
    params: Record<string, unknown>,
    sessionId?: string,
    instanceId?: string,
    pageId?: string,
    timeoutMs?: number,
  ): Promise<unknown> {
    const current = this.follower;
    if (!current) throw new OpError(ErrorCode.INTERNAL, "Coordinator is not in follower mode.");
    try {
      return await current.forward(op, params, sessionId, instanceId, pageId, timeoutMs);
    } catch (cause) {
      if (cause instanceof OpError && cause.code === ErrorCode.UNAUTHORIZED) {
        const fresh = await readLeader(current.info.port);
        if (fresh && fresh.token !== current.info.token && await Follower.checkHealth(fresh)) {
          this.follower = new Follower(fresh);
          return this.follower.forward(op, params, sessionId, instanceId, pageId, timeoutMs);
        }
      }
      throw cause;
    }
  }

  info(): LeaderInfo | undefined {
    return this.activeInfo ?? this.follower?.info;
  }

  private startMonitor(): void {
    this.stopMonitor();
    const generation = this.lifecycleGeneration;
    const [minDelay, maxDelay] = this.deps.healthIntervalMs ?? [3_000, 5_000];
    const tick = async () => {
      if (!this.isActive(generation) || this.role !== "follower" || !this.follower) return;
      const followed = this.follower.info;
      const healthy = await Follower.checkHealth(followed);
      if (!this.isActive(generation) || this.role !== "follower" || this.follower?.info.token !== followed.token) return;
      if (healthy) {
        this.monitor = scheduleJitter(minDelay, maxDelay, tick);
        return;
      }

      this.stopMonitor();
      // A follower never owns the leader record. A transient failed health
      // probe must not delete another live process's discovery file; stale
      // records are safely replaced only after a process actually claims the port.
      this.follower = undefined;
      try {
        await this.startGeneration(generation);
      } catch {
        if (this.isActive(generation)) this.monitor = scheduleJitter(minDelay, maxDelay, tick);
      }
    };
    this.monitor = scheduleJitter(minDelay, maxDelay, tick);
  }

  private stopMonitor(): void {
    if (this.monitor) clearTimeout(this.monitor);
    this.monitor = undefined;
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.lifecycleGeneration++;
    this.stopMonitor();
    const info = this.activeInfo;
    this.activeInfo = undefined;
    if (this.bridge) await this.bridge.close().catch(() => {});
    this.bridge = undefined;
    if (info) await removeIfSameLeader(info).catch(() => {});
    this.follower = undefined;
  }

  private isActive(generation: number): boolean {
    return !this.stopped && this.lifecycleGeneration === generation;
  }
}

export function candidatePorts(startPort = DEFAULT_PORT): number[] {
  const maxPort = DEFAULT_PORT + PORT_RANGE - 1;
  if (!Number.isInteger(startPort) || startPort < DEFAULT_PORT || startPort > maxPort) {
    throw new Error(`startPort must be between ${DEFAULT_PORT} and ${maxPort}.`);
  }
  const startOffset = startPort - DEFAULT_PORT;
  return Array.from({ length: PORT_RANGE }, (_, offset) => DEFAULT_PORT + ((startOffset + offset) % PORT_RANGE));
}

async function ensureRuntimeDirectory(): Promise<void> {
  const dir = baseDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe runtime directory: ${dir}`);
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error(`Runtime directory is not owned by the current user: ${dir}`);
  }
  await chmod(dir, 0o700).catch(() => {});
}

async function publishLeader(info: LeaderInfo): Promise<void> {
  await ensureRuntimeDirectory();
  const target = leaderFilePathFor(info.port);
  const scratch = `${target}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(scratch, JSON.stringify(info), { flag: "wx", mode: 0o600 });
    await rename(scratch, target);
  } finally {
    await rm(scratch, { force: true }).catch(() => {});
  }
}

async function readLeader(port: number): Promise<LeaderInfo | undefined> {
  try {
    const raw = JSON.parse(await readFile(leaderFilePathFor(port), "utf8")) as Partial<LeaderInfo>;
    if (
      raw.port !== port ||
      typeof raw.token !== "string" || raw.token.length < 32 ||
      typeof raw.pid !== "number" ||
      typeof raw.startedAt !== "number" ||
      typeof raw.version !== "string"
    ) return undefined;
    return raw as LeaderInfo;
  } catch {
    return undefined;
  }
}

async function removeIfSameLeader(known: LeaderInfo): Promise<void> {
  const current = await readLeader(known.port);
  if (!current) return;
  if (current.pid === known.pid && current.startedAt === known.startedAt && current.token === known.token) {
    await rm(leaderFilePathFor(known.port), { force: true });
  }
}

function addressInUse(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as { code?: unknown }).code === "EADDRINUSE";
}

function scheduleJitter(minDelay: number, maxDelay: number, fn: () => void): NodeJS.Timeout {
  const width = Math.max(1, maxDelay - minDelay);
  const timer = setTimeout(fn, minDelay + Math.floor(Math.random() * width));
  timer.unref?.();
  return timer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

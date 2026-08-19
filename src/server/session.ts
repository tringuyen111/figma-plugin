/** Lightweight agent-session registry used only for routing and health. */
export const SESSION_TTL_MS = 60 * 60 * 1000;

export interface AgentSession {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  execCount: number;
  errorCount: number;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, AgentSession>();
  private readonly pruneInterval: NodeJS.Timeout;

  constructor(pruneIntervalMs = 5 * 60 * 1000) {
    this.pruneInterval = setInterval(() => this.pruneIdle(), pruneIntervalMs);
    this.pruneInterval.unref?.();
  }

  get(sessionId: string): AgentSession {
    const now = Date.now();
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { id: sessionId, createdAt: now, lastActivityAt: now, execCount: 0, errorCount: 0 };
      this.sessions.set(sessionId, session);
    }
    session.lastActivityAt = now;
    return session;
  }

  recordExecution(sessionId: string, ok: boolean): void {
    const session = this.get(sessionId);
    session.execCount++;
    if (!ok) session.errorCount++;
    session.lastActivityAt = Date.now();
  }

  summaries(): Array<{ id: string; execCount: number; errorCount: number; lastActivityMs: number }> {
    const now = Date.now();
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      execCount: s.execCount,
      errorCount: s.errorCount,
      lastActivityMs: now - s.lastActivityAt,
    }));
  }

  pruneIdle(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > SESSION_TTL_MS) this.sessions.delete(id);
    }
  }

  close(): void {
    clearInterval(this.pruneInterval);
  }
}

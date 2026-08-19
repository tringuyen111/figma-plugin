import { describe, expect, it } from "vitest";
import { SessionRegistry } from "../../src/server/session.js";

describe("SessionRegistry", () => {
  it("tracks agent execution activity and errors", () => {
    const sessions = new SessionRegistry(60_000);
    try {
      sessions.recordExecution("agent-a", true);
      sessions.recordExecution("agent-a", false);
      expect(sessions.summaries()).toMatchObject([{ id: "agent-a", execCount: 2, errorCount: 1 }]);
    } finally {
      sessions.close();
    }
  });
});

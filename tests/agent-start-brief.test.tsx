import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseAgentSessionRequest } from "../shared/agent-session";
import { AgentBubble } from "../src/agent/AgentBubble";
import {
  BRIEF_MAX,
  OPEN_PROJECT_PROMPT,
  startPrompt,
} from "../src/agent/spawn";

// Start Genobi takes an optional typed brief, so the loop can start without a
// microphone; with nothing typed it is the fixed opening it always was.
describe("Start Genobi's typed brief", () => {
  it("is the fixed opening without words, the person's brief with them", () => {
    expect(startPrompt()).toBe(OPEN_PROJECT_PROMPT);
    expect(startPrompt("  \n ")).toBe(OPEN_PROJECT_PROMPT);
    const prompt = startPrompt("Make the falling room\u0007 in a cathedral");
    expect(prompt).toBe(
      "Link my open Director project if there is one, then do this. My brief: Make the falling room in a cathedral",
    );
    // A typed start the server accepts, as a typed source.
    expect(parseAgentSessionRequest({ prompt, source: "typed" })).toMatchObject(
      { prompt, source: "typed" },
    );
    expect(startPrompt("x".repeat(BRIEF_MAX + 50)).length).toBeLessThan(4000);
  });

  it("shows the brief box only before a session starts", () => {
    const idle = renderToStaticMarkup(<AgentBubble defaultOpen />);
    expect(idle).toContain('aria-label="Brief for Genobi"');
    expect(idle).toContain(`maxLength="${BRIEF_MAX}"`);
    expect(idle).toContain("Start Genobi");
    const running = renderToStaticMarkup(
      <AgentBubble
        defaultOpen
        session={{
          id: "s",
          runner: "claude",
          status: "running",
          startedAt: "2026-10-29T10:00:00Z",
          prompt: "Go",
          lines: [],
        }}
      />,
    );
    expect(running).not.toContain("Brief for Genobi");
  });
});

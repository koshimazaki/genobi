import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentSession } from "../shared/agent-session";
import {
  AgentBubble,
  bubbleLabel,
  bubbleUpdate,
} from "../src/agent/AgentBubble";
import {
  AgentConversation,
  conversationOf,
  replyCount,
} from "../src/agent/AgentConversation";

const session: AgentSession = {
  id: "test-session",
  runner: "claude",
  status: "running",
  startedAt: "2026-10-21T12:00:00Z",
  prompt: "Use my character.",
  lines: ["Connected: genobi.", "Using genobi_project_read"],
};

describe("the Genobi bubble's evidence boundary", () => {
  it("shows received text as an agent update, without inferring tool totals", () => {
    expect(bubbleUpdate(session)).toEqual({
      source: "Agent update",
      text: "Using genobi_project_read",
    });
    const html = renderToStaticMarkup(
      <AgentBubble session={session} onStop={() => {}} />,
    );
    expect(html).toContain('aria-label="Open Genobi activity"');
    expect(html).not.toContain('class="agent-count"');
    expect(html).not.toMatch(
      /tools planned|assets selected|Preview ready|progressbar|textarea/,
    );
    expect(html).not.toContain("Stop session");
    expect(html).not.toContain('aria-label="Recent session updates"');
  });
  it("labels an interpretation or completion claim as the agent's summary", () => {
    const summary = "3 tools planned · 8 assets selected";
    expect(bubbleUpdate({ ...session, status: "done", summary })).toEqual({
      source: "Agent summary",
      text: summary,
    });
    const html = renderToStaticMarkup(
      <AgentBubble
        session={{ ...session, status: "done", summary }}
        onStop={() => {}}
      />,
    );
    expect(html).toContain("Session finished");
    expect(html).not.toContain("Stop session");
    expect(html).not.toContain("Preview ready");
  });
  it("uses only the session state when no lines have arrived", () => {
    expect(
      bubbleUpdate({
        ...session,
        status: "starting",
        lines: [],
        summary: "  ",
      }),
    ).toEqual({ source: "Session", text: "Starting" });
  });
  it("keeps a stale update visibly separate from a connection failure", () => {
    const html = renderToStaticMarkup(
      <AgentBubble
        session={session}
        error="Connection interrupted"
        onStop={() => {}}
      />,
    );
    expect(html).not.toContain("Using genobi_project_read");
    expect(html).toContain('data-error="true"');
    expect(html).toContain("Connection interrupted");
  });
});

it("keeps approvals discoverable without forcing the optional bubble open", () => {
  const html = renderToStaticMarkup(
    <AgentBubble session={session} attention />,
  );
  expect(html).toContain("Approval waiting");
  expect(html).toContain('aria-expanded="false"');
});

describe("the bubble as one conversation (Box 1.8)", () => {
  const exchange = [
    {
      from: "person" as const,
      text: "Cut the drop.",
      at: "2026-10-27T12:00:00Z",
    },
    {
      from: "agent" as const,
      text: "Cut at 0:12.",
      at: "2026-10-27T12:01:00Z",
    },
    {
      from: "person" as const,
      text: "Softer headline.",
      at: "2026-10-27T12:02:00Z",
    },
  ];
  const view = (s: AgentSession) =>
    renderToStaticMarkup(
      <AgentConversation session={s} exchange={conversationOf(s)!} />,
    );

  it("shows each message and reply in order, with the turn's activity line", () => {
    const html = view({ ...session, exchange, live: true });
    expect(html).toContain('aria-label="Conversation"');
    const order = ["Cut the drop.", "Cut at 0:12.", "Softer headline."].map(
      (text) => html.indexOf(text),
    );
    expect(
      order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])),
    ).toBe(true);
    expect(html).toContain('data-from="agent"');
    // The latest received line, while this turn runs.
    expect(html).toContain("Using genobi_project_read");
    expect(html).not.toContain("textarea");
  });

  it("waits for the next message once a turn is answered", () => {
    const answered: AgentSession = {
      ...session,
      exchange: [
        ...exchange,
        { from: "agent", text: "Softened.", at: "2026-10-27T12:03:00Z" },
      ],
      idle: true,
      live: true,
    };
    expect(bubbleLabel(answered)).toBe("Waiting for your next message");
    expect(bubbleLabel(answered, true)).toBe("Approval waiting");
    expect(bubbleLabel({ ...answered, status: "done" })).toBe(
      "Session finished",
    );
    const html = view(answered);
    expect(html).toContain("Softened.");
    expect(html).not.toContain("Using genobi_project_read");
  });

  it("keeps the one-prompt view for a session with no reply yet", () => {
    expect(conversationOf({ ...session, exchange: exchange.slice(0, 1) })).toBe(
      undefined,
    );
    expect(conversationOf(session)).toBe(undefined);
  });

  it("counts only the runner's replies for the avatar's new-reply mark", () => {
    expect(replyCount(exchange)).toBe(1);
    expect(replyCount(undefined)).toBe(0);
  });
});

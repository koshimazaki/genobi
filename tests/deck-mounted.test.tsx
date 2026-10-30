import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentSession } from "../shared/agent-session";
import Topbar from "../src/components/Topbar";
import {
  closeAgentSession,
  latestAgentSession,
  publishAgentSession,
  showAgentSession,
} from "../src/agent/useAgentSession";
import GenobiDeck from "../src/deck/GenobiDeck";
import DeckLog from "../src/deck/DeckLog";
import { deckNow, sessionLine } from "../src/deck/deck-now";

const DECK = 'aria-label="Genobi terminal"';
const count = (markup: string, text: string) => markup.split(text).length - 1;

const session = (over: Partial<AgentSession> = {}): AgentSession => ({
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "running",
  prompt: "Open the project and cut the teaser",
  startedAt: "2026-10-27T10:00:00.000Z",
  lines: Array.from({ length: 12 }, (_, i) => `update ${i + 1}`),
  ...over,
});

afterEach(() => {
  closeAgentSession();
  vi.unstubAllGlobals();
});

describe("the studio header mounts the deck", () => {
  // 51777ec dropped <GenobiDeck /> from the wordmark inside an unrelated
  // change and nothing failed. The studio's header is where the bubble and
  // the deck live in every preset; this fails if either goes again.
  it("renders the deck once, beside the bubble whose session it reads", () => {
    const markup = renderToStaticMarkup(
      <Topbar
        apiKey=""
        hasServerKey={false}
        connection={0}
        keyVerified={false}
        onVerified={() => {}}
        revision=""
        onOpenKey={() => {}}
      />,
    );
    expect(count(markup, DECK)).toBe(1);
    expect(count(markup, 'aria-label="Genobi activity"')).toBe(1);
  });
});

describe("the deck's bar", () => {
  const idle = { connected: false };

  it("shows a working session's newest line, even over a running job", () => {
    const now = deckNow({
      activity: [{ id: "job-a", line: "GENERATING LTX VIDEO  5s" }],
      session: session(),
      linked: [],
      supervisor: idle,
    });
    expect(now).toBe("update 12");
  });

  it("shows a running job before a finished session's summary", () => {
    const done = session({ status: "done", summary: "Cut ready" });
    expect(sessionLine(done)).toBe("Cut ready");
    expect(
      deckNow({
        activity: [{ id: "job-a", line: "GENERATING LTX VIDEO  5s" }],
        session: done,
        linked: [],
        supervisor: idle,
      }),
    ).toBe("GENERATING LTX VIDEO  5s");
    expect(
      deckNow({ activity: [], session: done, linked: [], supervisor: idle }),
    ).toBe("Cut ready");
  });

  it("names the state until a line arrives, then falls back to ready", () => {
    expect(sessionLine(session({ status: "starting", lines: [] }))).toBe(
      "HERMES · STARTING",
    );
    expect(deckNow({ activity: [], linked: [], supervisor: idle })).toBe(
      "READY · SPEAK OR TYPE TO START",
    );
  });

  it("follows the session the bubble shows, before and after its polls", () => {
    // The deck's hook reads this snapshot (a server render has none).
    const shown = session();
    showAgentSession(shown);
    expect(latestAgentSession()).toBe(shown);
    const polled = session({ lines: [...shown.lines, "update 13"] });
    publishAgentSession(polled);
    expect(latestAgentSession()).toBe(polled);
    // A new session replaces it at once, before the panel polls it.
    const next = session({ id: "22222222-2222-4222-8222-222222222222" });
    showAgentSession(next);
    expect(latestAgentSession()).toBe(next);
  });
});

describe("the open deck", () => {
  it("shows the whole log, the request and the bubble action", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ open: true, program: "rain" }),
      setItem: () => {},
    });
    expect(renderToStaticMarkup(<GenobiDeck />)).toContain("deck-body");
    const markup = renderToStaticMarkup(
      <DeckLog
        activity={[]}
        session={session({ summary: "Waiting on your pick" })}
        actors={[]}
        linked={[]}
        supervisor={{ connected: false }}
      />,
    );
    for (let i = 1; i <= 12; i++) expect(markup).toContain(`>update ${i}<`);
    expect(markup).toContain("Open the project and cut the teaser");
    expect(markup).toContain("Waiting on your pick");
    expect(markup).toContain("Open bubble");
    expect(markup).not.toMatch(/Stop session|Approve/);
  });
});

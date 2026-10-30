import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AgentSession, AgentSessionStatus } from "../shared/agent-session";
import {
  showAgentSession,
  closeAgentSession,
} from "../src/agent/useAgentSession";

// Dev-only fixtures exercise the production owner. Only these preview IDs are
// intercepted; no agent is launched and every unrelated request stays real.
let view: AgentSession;
let offline = false;
let stopped: (() => void) | undefined;
let serial = 0;
const fixtureEnabled =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("fixture") === "1";
const originalFetch = window.fetch.bind(window);
if (fixtureEnabled)
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href,
    );
    if (!url.pathname.startsWith("/api/agent/sessions/preview-fixture-"))
      return originalFetch(input, init);
    if (url.pathname.endsWith("/stop")) {
      view = { ...view, status: "stopped" };
      stopped?.();
    } else if (offline)
      return Response.json(
        { error: "Connection interrupted. Checking again…" },
        { status: 503 },
      );
    return Response.json(view);
  };
function Preview() {
  const [status, setStatus] = useState<AgentSessionStatus>("waiting");
  const [error, setError] = useState(false);
  const [long, setLong] = useState(false);
  const [talk, setTalk] = useState(false);
  useEffect(() => {
    offline = error;
    stopped = () => setStatus("stopped");
    view = {
      id: `preview-fixture-${++serial}`,
      runner: "claude",
      status,
      startedAt: "2026-10-21T12:00:00Z",
      prompt:
        "Use my character image for the intro. Keep the soundtrack and make the headline softer.",
      lines: long
        ? Array.from(
            { length: 40 },
            (_, i) =>
              `Received update ${i + 1}: ` +
              "A long asset filename with details to inspect. ".repeat(5),
          )
        : [
            "Connected: genobi.",
            "I’ll use your character in the intro and keep the existing soundtrack.",
            "Using genobi_project_read",
          ],
      ...(status === "waiting"
        ? {
            summary:
              "Add a character image to Project assets, then send a new project prompt when it’s ready.",
          }
        : status === "done"
          ? {
              summary:
                "The session has finished. Check the composition before exporting.",
            }
          : status === "failed"
            ? { summary: "The agent stopped before it finished." }
            : {}),
      // Box 1.8: a conversation that has had one reply and a second message.
      ...(talk
        ? {
            live: true as const,
            exchange: [
              {
                from: "person" as const,
                text: "Use my character image for the intro.",
                at: "2026-10-21T12:00:00Z",
              },
              {
                from: "agent" as const,
                text: "The intro now opens on your character. The soundtrack is unchanged.",
                at: "2026-10-21T12:01:00Z",
              },
              {
                from: "person" as const,
                text: "Make the headline softer.",
                at: "2026-10-21T12:02:00Z",
              },
            ],
          }
        : {}),
    };
    showAgentSession(view);
  }, [status, error, long, talk]);
  return (
    <details className="bubble-fixture-controls">
      <summary>Local fixture · no agent</summary>
      <div>
        <strong>Illustrative events only</strong>
        <label>
          Session state{" "}
          <select
            aria-label="Fixture session state"
            value={status}
            onChange={(e) => setStatus(e.target.value as AgentSessionStatus)}
          >
            {[
              "starting",
              "running",
              "waiting",
              "done",
              "failed",
              "stopped",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={error}
            onChange={(e) => {
              setError(e.target.checked);
              if (e.target.checked) setStatus("running");
            }}
          />
          Connection error
        </label>
        <label>
          <input
            type="checkbox"
            checked={long}
            onChange={(e) => setLong(e.target.checked)}
          />
          Long activity
        </label>
        <label>
          <input
            type="checkbox"
            checked={talk}
            onChange={(e) => {
              setTalk(e.target.checked);
              if (e.target.checked) setStatus("running");
            }}
          />
          Conversation
        </label>
        <button
          type="button"
          disabled={!talk}
          onClick={() => {
            // The next poll reads a reply, as a turn's result would bring it.
            view = {
              ...view,
              idle: true,
              exchange: [
                ...(view.exchange ?? []),
                {
                  from: "agent",
                  text: "The headline is softer now.",
                  at: new Date().toISOString(),
                },
              ],
            };
          }}
        >
          Fixture reply
        </button>
      </div>
    </details>
  );
}
if (import.meta.env.DEV) {
  const root = createRoot(document.getElementById("bubble-fixture")!);
  if (fixtureEnabled) root.render(<Preview />);
  else {
    root.render(null);
    closeAgentSession();
    document.title = "Genobi Studio";
  }
}

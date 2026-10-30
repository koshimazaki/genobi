import { useEffect, useState } from "react";
import { AGENT_REQUEST_HEADER } from "../../shared/agent-session-events";
import {
  developmentActive,
  type DevelopmentSession,
  type DevelopmentState,
} from "../../shared/development-session";

const headers = {
  [AGENT_REQUEST_HEADER]: "1",
  "Content-Type": "application/json",
};
const runnerName = { hermes: "Hermes", codex: "Codex", claude: "Claude Code" };

/**
 * Developers a creative Genobi session started (`genobi_develop`): what it
 * was asked, its branch and worktree, progress and the pull request, with
 * Stop. Read from the managed `/api/development` sessions, as the person's.
 */
export default function GenobiDevelopers() {
  const [sessions, setSessions] = useState<DevelopmentSession[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const update = () =>
      fetch("/api/development", { headers })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((state: DevelopmentState | undefined) => {
          if (!disposed && state)
            setSessions(state.sessions.filter((s) => s.startedBy).slice(0, 3));
        })
        .catch(() => {});
    void update();
    const timer = window.setInterval(update, 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  if (!sessions.length) return null;
  const stop = async (id: string) => {
    const response = await fetch(
      `/api/development/${encodeURIComponent(id)}/stop`,
      { method: "POST", headers },
    ).catch(() => undefined);
    setError(response?.ok ? "" : "Could not stop that Developer.");
  };
  return (
    <section
      className="genobi-developers"
      aria-label="Developers Genobi started"
    >
      {sessions.map((session) => (
        <article key={session.id}>
          <p className="supervisor-note">
            Started by Genobi for:{" "}
            <q>{session.develop?.task ?? session.prompt}</q>
          </p>
          <p className="supervisor-note">
            {runnerName[session.runner]} · {session.status} ·{" "}
            {session.develop?.mode === "pr" ? "commit + PR" : "diff only"} ·{" "}
            <code>{session.develop?.branch}</code>
          </p>
          {session.develop?.prUrl && (
            <a
              href={session.develop.prUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Pull request ↗
            </a>
          )}
          <pre>
            {(session.handover || session.lines.slice(-4).join("\n")).slice(
              -1200,
            )}
          </pre>
          {developmentActive(session) && session.status !== "stopping" && (
            <button type="button" onClick={() => void stop(session.id)}>
              Stop Developer
            </button>
          )}
        </article>
      ))}
      {error && <p role="status">{error}</p>}
    </section>
  );
}

import { useState } from "react";
import { agentStatus } from "../agent/api";
import type { AgentRunnerStatus } from "../../shared/agent-session";
import { RunnerPairing } from "./RunnerPairing";
export function AgentConnectionSettings() {
  const [status, setStatus] = useState<AgentRunnerStatus>();
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    try {
      setStatus(await agentStatus(AbortSignal.timeout(10_000)));
    } catch {
      setStatus({
        available: false,
        message: "The runner did not answer. Check the local server and retry.",
      });
    } finally {
      setChecking(false);
    }
  }
  return (
    <section className="activity-settings" aria-label="Agent connections">
      <h3>Hermes & external agents</h3>
      <p>
        Authenticate Hermes in its own terminal with <code>hermes model</code>.
        Genobi keeps no Hermes subscription key. Configure its Genobi profile,
        then check the local runner.
      </p>
      <button type="button" disabled={checking} onClick={() => void check()}>
        {checking ? "Checking runner…" : "Check Hermes connection"}
      </button>
      {status && (
        <p role="status">
          {status.available
            ? `${status.runner === "hermes" ? "Hermes" : "Claude Code"} runner is configured. A real session is still needed to verify provider authentication.`
            : status.message}
        </p>
      )}
      <p>
        Pair this local studio with your hosted studio below to launch its
        configured runner remotely. Codex and Claude Code can also connect
        through the Genobi plugin.
      </p>
      <a
        href="https://github.com/koshimazaki/Genobi/blob/main/docs/hermes-open-route.md"
        target="_blank"
        rel="noreferrer"
      >
        Hermes setup instructions ↗
      </a>
      <RunnerPairing />
    </section>
  );
}

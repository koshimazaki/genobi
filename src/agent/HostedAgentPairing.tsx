import {
  SETUP_RUNNER_NAMES,
  type SetupRunner,
} from "../../shared/agent-runner-setting";
import { RunnerPairing } from "../components/RunnerPairing";
import { LOCAL_SETUP_URL } from "../voice/availability";

/** Setup instructions around the existing Settings pairing flow. */
export function HostedAgentPairing({ runner }: { runner?: SetupRunner }) {
  const name = runner ? SETUP_RUNNER_NAMES[runner] : "your agent";
  return (
    <section className="setup-agent" aria-label="Connect your local studio">
      <h3>Connect your local Genobi to run {name} on your machine</h3>
      <p>
        This hosted studio needs your local studio paired before it can start an
        agent. Run Genobi locally, choose and sign in to {name} there, then
        create a code below. In local Settings, open “Pair hosted and local
        Genobi”, paste the complete code and confirm. Keep the local studio
        running.
      </p>
      <p>
        <a href="http://127.0.0.1:4317" target="_blank" rel="noreferrer">
          Open local studio ↗
        </a>
        {" · "}
        <a href={LOCAL_SETUP_URL} target="_blank" rel="noreferrer">
          Run locally — README setup instructions ↗
        </a>
      </p>
      {runner === "codex" && (
        <p role="status">
          Codex works with the Genobi plugin in its own terminal. Studio
          sessions and pairing currently support Hermes and Claude Code; choose
          one in local setup to start sessions here.
        </p>
      )}
      <RunnerPairing runner={runner} />
    </section>
  );
}

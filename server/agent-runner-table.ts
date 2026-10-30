// The runners agent sessions start (server/agent-sessions.ts): each one's
// name, the plan that runs it and how its output reads, and the session
// errors shared by the start and read paths.
import type { AgentRunner } from "../shared/agent-session";
import { hermesPlan } from "./agent-hermes";
import { hermesReader } from "./agent-hermes-stream";
import { claudePlan } from "./agent-runner";
import { readStreamLine, type StreamUpdate } from "./agent-stream";
import { AppError } from "./errors";

/** Each runner: its name, the command it runs and how its output reads. */
export const RUNNERS: Record<
  AgentRunner,
  {
    label: string;
    plan: typeof claudePlan;
    reader: () => (raw: string) => StreamUpdate[];
  }
> = {
  claude: {
    label: "Claude Code",
    plan: claudePlan,
    reader: () => readStreamLine,
  },
  hermes: { label: "Hermes", plan: hermesPlan, reader: hermesReader },
};

export const shuttingDown = () =>
  new AppError(503, "The studio is shutting down.", "agent_unavailable");

export const notFound = () =>
  new AppError(404, "Agent session not found.", "agent_session_missing");

/**
 * One running session per owner and `max` per machine. A refused start
 * names the owner's running session, so the studio shows and follows it
 * rather than ending on the refusal (a Terminal session outlives the page).
 */
export function assertCapacity(
  running: readonly { owner: string; view: { id: string } }[],
  owner: string,
  max: number,
) {
  const busy = running.find((s) => s.owner === owner);
  if (busy)
    throw new AppError(
      409,
      "An agent session is already running. Stop it or wait for it to finish.",
      "agent_busy",
      { sessionId: busy.view.id },
    );
  if (running.length >= max)
    throw new AppError(
      429,
      "Two agent sessions are already running on this machine.",
      "agent_limit",
    );
}

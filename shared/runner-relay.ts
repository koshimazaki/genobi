import {
  parseAgentSessionRequest,
  type AgentSessionRequest,
  type AgentSessionStatus,
} from "./agent-session";
import { plainText } from "./agent-context";

export const PAIR_CODE_MS = 10 * 60_000;
export const PAIR_LIFETIME_MS = 24 * 60 * 60_000;
export const RUNNER_ONLINE_MS = 20_000;
/** Idle poll is slower to conserve D1; active sessions still report every 3s. */
export const RUNNER_ACTIVE_POLL_MS = 3_000;
export const RUNNER_IDLE_POLL_MS = 6_000;
export const RELAY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const RELAY_SECRET = /^[0-9a-f]{64}$/;
export interface RunnerUpdate {
  id: string;
  localId?: string;
  status: AgentSessionStatus;
  lines: string[];
  summary?: string;
}
/** Keep active progress and Stop responsive, but avoid idle write storms. */
export const runnerPollDelay = (
  updates: readonly Pick<RunnerUpdate, "status">[],
) =>
  updates.some(({ status }) =>
    ["starting", "running", "waiting"].includes(status),
  )
    ? RUNNER_ACTIVE_POLL_MS
    : RUNNER_IDLE_POLL_MS;

export interface RunnerPoll {
  command?: { id: string; request: AgentSessionRequest };
  stops: string[];
}
export function relayRequest(value: unknown): AgentSessionRequest {
  const request = parseAgentSessionRequest(value);
  // Setup's start runs from the local studio only: its brief names this
  // machine's voice folder, which must never travel back to the hosted side.
  if (request.setup)
    throw new Error(
      "Setup starts your agent from the local studio only. Open the local studio to finish setup.",
    );
  // A Terminal window opens on the machine that serves the studio.
  if (request.mode === "terminal")
    throw new Error(
      "A Terminal session opens from the local studio only. Run it in the bubble here.",
    );
  if (
    request.copyId ||
    request.context?.picks.length ||
    request.context?.settings?.sourceId
  )
    throw new Error(
      "Hosted assets are not synced to this runner. Open the local studio to use project files or picked takes.",
    );
  return request;
}
export function runnerUpdate(value: unknown): RunnerUpdate {
  const v = value as RunnerUpdate;
  if (
    !v ||
    typeof v.id !== "string" ||
    !RELAY_ID.test(v.id) ||
    (v.localId !== undefined &&
      (typeof v.localId !== "string" || !RELAY_ID.test(v.localId))) ||
    ![
      "starting",
      "running",
      "waiting",
      "done",
      "failed",
      "stopped",
      "interrupted",
    ].includes(v.status) ||
    !Array.isArray(v.lines) ||
    v.lines.length > 40 ||
    v.lines.some((line) => typeof line !== "string" || line.length > 300) ||
    (v.summary !== undefined &&
      (typeof v.summary !== "string" || v.summary.length > 2000))
  )
    throw new Error("Invalid runner update.");
  return {
    id: v.id,
    ...(v.localId ? { localId: v.localId } : {}),
    status: v.status,
    lines: v.lines.map((line) => plainText(line, 300)),
    ...(v.summary ? { summary: plainText(v.summary, 2000) } : {}),
  };
}
export function localRunnerOrigin(value: string) {
  // This is only a link back to the owner's local studio, never a fetch target.
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(value))
    throw new Error("Use a loopback studio origin.");
  return value;
}

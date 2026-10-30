import {
  AGENT_RUNNERS,
  type AgentRunnerStatus,
} from "../../shared/agent-session";
import { COPY_ID } from "../../shared/director/commands";
import { AGENT_REQUEST_HEADER } from "../../shared/agent-session-events";

/**
 * The studio's side of the project prompt (issue #23): ask the local server
 * whether an agent session can run, find the open project's copy, and start
 * the session. The hosted studio can relay typed prompts; a missing or
 * malformed status reads as "not set up here" rather than an error.
 */

/**
 * Every agent request carries this header. A cross-site page cannot add a
 * custom header without a CORS preflight, which the local server never
 * grants, so only the studio itself can start a session.
 */
export const AGENT_HEADER = { [AGENT_REQUEST_HEADER]: "1" } as const;

export const NOT_SET_UP = "Agent sessions aren't set up on this server.";

const RUNNER_NAMES: Record<AgentRunnerStatus["runner"] & string, string> = {
  claude: "Claude Code",
  hermes: "Hermes",
};

/** A short line from the server, stripped of control characters. */
const line = (value: unknown, limit = 300) =>
  typeof value === "string"
    ? Array.from(value, (c) => (c < " " || c === "\x7f" ? " " : c))
        .join("")
        .trim()
        .slice(0, limit) || undefined
    : undefined;

export async function agentStatus(
  fetcher: typeof fetch = fetch,
): Promise<AgentRunnerStatus> {
  try {
    const response = await fetcher("/api/agent/status", {
      headers: AGENT_HEADER,
    });
    const body = response.ok ? await response.json() : undefined;
    if (typeof body?.available !== "boolean") return { available: false };
    const runner = (AGENT_RUNNERS as readonly unknown[]).includes(body.runner)
      ? (body.runner as AgentRunnerStatus["runner"])
      : undefined;
    const message = line(body.message);
    return {
      available: body.available,
      ...(runner ? { runner } : {}),
      ...(message ? { message } : {}),
    };
  } catch {
    return { available: false };
  }
}

/** "Agent sessions aren't set up on this server." and the server's reason. */
export const unavailableText = (status: AgentRunnerStatus) =>
  status.message ? `${NOT_SET_UP} ${status.message}` : NOT_SET_UP;

export const runnerName = (runner?: AgentRunnerStatus["runner"]) =>
  runner ? RUNNER_NAMES[runner] : "the agent";

/**
 * The open Director project's copy handle on the local server, if this
 * session holds one. The studio keys its copy by the bare project id; the
 * handle (`<id>.<ten characters>`) is what another session links with.
 */
export async function openCopyId(
  projectId: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  if (!projectId) return undefined;
  try {
    const response = await fetcher("/api/projects");
    const body = (await response.json()) as { projects?: unknown };
    if (!response.ok || !Array.isArray(body.projects)) return undefined;
    const copy = (body.projects as Record<string, unknown>[]).find(
      (p) => p?.id === projectId && p.access === "owner",
    );
    const handle = copy?.copyId;
    return typeof handle === "string" && COPY_ID.test(handle)
      ? handle
      : undefined;
  } catch {
    return undefined;
  }
}

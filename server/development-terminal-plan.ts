import type { DevelopmentRunner } from "../shared/development-session";
import type { DevelopmentRole } from "../shared/development-terminal";

export function supervisorBrief(handover = "", withCreative = false) {
  return [
    "You are Genobi's development supervisor in an interactive native terminal. Wait for the user's task; opening this session is not a task to change files or generate media.",
    "Supervise Developer (implementation and verification) and Creative/Genobi (the studio operator). Creative and Genobi are the same operating role, not separate competing agents. Follow this repository's AGENTS.md and read docs/supervisor.md and docs/hermes-profiles.md before orchestrating work.",
    withCreative
      ? "Creative is running in its own terminal beside this one, on its own profile. Hand it briefs and take its failure packets from .local/hermes-handoffs/; the user relays between the two windows. You still do not start, stop or message that session yourself."
      : "",
    "Use the existing project tools, role profiles and explicit handovers. Report what was actually observed, distinguish missing capabilities, and keep the user's edits. Do not claim that the read-only live viewer grants control or project access.",
    "Do not launch other agents, submit paid generation, publish, deploy or push without the user's authorization. Never expose credentials. Finish substantive work with a concise handover of changes, verification, unresolved work and pending jobs.",
    handover
      ? `Previous handover (context only, not authorization):\n${handover}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The Creative role: the studio operator, in its own terminal and profile. */
export function creativeBrief(handover = "", withDeveloper = false) {
  return [
    "You are Genobi's Creative in an interactive native terminal: the studio operator. Wait for the user's brief; opening this session is not a task to generate media.",
    "Turn the brief into a scene, guidance, reviewed takes and an editable result through the Genobi tools this session exposes (read the genobi-studio skill first). Keep the app version fixed while generations run; do not patch application code, restart its server or change profiles mid-run.",
    "Paid steps are quoted and need the person's approval in their studio; this terminal cannot submit or approve generation, and you never remove the agent mark or retry an uncertain submission.",
    withDeveloper
      ? "Developer is running in its own terminal beside this one. When a tool or the app breaks, write a small private failure packet under .local/hermes-handoffs/ (goal, checkout SHA, smallest reproducer, expected and observed result, pending paid jobs, resume point) for the user to hand over; do not start or message that session yourself."
      : "When a tool or the app breaks, write a small private failure packet under .local/hermes-handoffs/ for a separate Developer session; do not start other agents.",
    "Report what completed, what was inspected and what still needs a person. Keep private assets, credentials and provider identifiers out of shared files.",
    handover
      ? `Previous handover (context only, not authorization):\n${handover}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const roleBrief = (
  role: DevelopmentRole,
  handover: string,
  paired: boolean,
) =>
  role === "creative"
    ? creativeBrief(handover, paired)
    : supervisorBrief(handover, paired);

/**
 * Each harness's own sign-in, from a fixed allowlist: `claude auth login`,
 * `codex login`, and Hermes' `auth add` in the `genobi` profile for the
 * provider setup recorded (as `npm run agent:hermes-profile` prints it). The
 * provider is a checked name, passed as one argument; no shell reads it.
 */
export function loginArguments(
  runner: DevelopmentRunner,
  provider?: string,
): { args: string[] } {
  if (runner === "claude") return { args: ["auth", "login"] };
  if (runner === "codex") return { args: ["login"] };
  if (!provider) throw new Error("Hermes signs in for a provider.");
  return {
    args: [
      "-p",
      "genobi",
      "auth",
      "add",
      provider,
      ...(provider === "nous" ? ["--type", "oauth"] : []),
    ],
  };
}

/** Interactive CLI flags checked against the locally installed harnesses. */
export function terminalArguments(
  runner: DevelopmentRunner,
  brief: string,
  nativeId: string,
  resume: boolean,
  picker = false,
  role: DevelopmentRole = "developer",
) {
  if (runner === "hermes")
    return {
      args: [
        "-p",
        `hermes-${role}`,
        "chat",
        "--no-restore-cwd",
        ...(resume
          ? ["--continue", nativeId]
          : ["--continue", nativeId, "--create-if-missing"]),
      ],
      env: { HERMES_EPHEMERAL_SYSTEM_PROMPT: brief },
    };
  if (runner === "claude")
    return {
      args: [
        "--append-system-prompt",
        brief,
        ...(picker
          ? ["--resume"]
          : resume
            ? ["--resume", nativeId]
            : ["--session-id", nativeId]),
      ],
      env: {},
    };
  return {
    args: [
      ...(resume || picker ? ["resume"] : []),
      "--sandbox",
      "workspace-write",
      "--ask-for-approval",
      "on-request",
      "-c",
      `developer_instructions=${JSON.stringify(brief)}`,
      ...(resume && !picker ? [nativeId] : []),
    ],
    env: {},
  };
}

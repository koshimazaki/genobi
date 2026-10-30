import { access } from "node:fs/promises";
import path from "node:path";
import {
  developmentRunner,
  type DevelopmentRunner,
  type DevelopWork,
} from "../shared/development-session";
import type { AgentConfig } from "./agent-config";
import { baseEnv, type LaunchPlan } from "./agent-runner";

/**
 * The Developer a creative Genobi session starts (`genobi_develop`): its
 * runner, brief and launch plan. The person picks the runner in setup; the
 * agent never does. See docs/agent-sessions.md#genobi-starts-a-developer.
 */

/**
 * `GENOBI_DEVELOP_RUNNER` (hermes, claude or codex) when set and valid,
 * otherwise the harness the setup saved for agent sessions
 * (`GENOBI_AGENT_RUNNER` or `.local/agent.json`), Codex included.
 */
export function savedDevelopRunner(
  config: Pick<AgentConfig, "runner" | "unsupportedRunner">,
  env: NodeJS.ProcessEnv = process.env,
): DevelopmentRunner | undefined {
  const asked = env.GENOBI_DEVELOP_RUNNER?.trim();
  if (asked) return developmentRunner.safeParse(asked).data;
  return config.runner ?? config.unsupportedRunner;
}

/** The Hermes root that holds `profiles/hermes-developer`. */
export const hermesRootOf = (env: NodeJS.ProcessEnv = process.env) =>
  env.GENOBI_AGENT_HERMES_ROOT ?? path.join(env.HOME ?? "", ".hermes");

/** Whether the Developer role's Hermes profile is installed. */
export const hasDeveloperProfile = (env: NodeJS.ProcessEnv = process.env) =>
  access(
    path.join(hermesRootOf(env), "profiles/hermes-developer/config.yaml"),
  ).then(
    () => true,
    () => false,
  );

const CHECKS = [
  "npm run format:check",
  "npm run lint",
  "npm run check:size",
  "npm run typecheck",
  "npm run check:worker",
  "npm run check:registry",
  "npm test",
];

/** The Developer's whole brief; the person's words are the task, verbatim. */
export function developBrief(work: DevelopWork) {
  return [
    "You are Genobi's Developer. The creative Genobi session in the person's studio started you for the change below; the person sees your progress in Project Tools → Development.",
    `Work only in this git worktree: ${work.worktree}, on branch ${work.branch}, made from origin/main. Never edit the main checkout the studio serves, and never switch this worktree to another branch.`,
    "Read AGENTS.md, docs/read-through.md and docs/review-checklist.md first. If node_modules is missing, run npm ci. Keep every file at or under 500 lines; split by topic. Update the docs that describe what you change in the same change. Rebuild the MCP bundle (npm run build:mcp) when mcp/ or the tool list changes.",
    `Run the repository checks and report each result: ${CHECKS.join(", ")}. Say plainly which ones you did not run or that failed.`,
    work.mode === "pr"
      ? `The person asked for a commit and a pull request. Commit on ${work.branch} as the repository's configured git user, with no co-author, generator or tool attribution. Push only that branch (git push -u origin ${work.branch}) and open a pull request against main (gh pr create --base main). Print the pull request URL on its own line.`
      : "Do not commit. Leave the change uncommitted in this worktree as a reviewable diff, and list the changed files.",
    "Never merge, never deploy, never push to main, never force-push, and never run a remote migration. Do not submit paid generation or call a paid studio route by any means: your Genobi tools carry the agent mark and cannot spend. Do not start other agents. Never print credentials.",
    "Finish with a concise handover: what changed and where, the checks with results, the pull request URL if any, what is left, and one or two sentences the creative session can tell the person.",
    work.files.length
      ? `Files the person or Genobi pointed at (hints, not limits):\n${work.files.map((f) => `- ${f}`).join("\n")}`
      : "",
    `The person's request, verbatim:\n${work.task}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Claude Code may only run these in the worktree; `pr` adds commit, push and PR. */
export function claudeAllowed(work: DevelopWork) {
  return [
    "Read",
    "Glob",
    "Grep",
    "Edit",
    "Write",
    "MultiEdit",
    "Bash(npm ci)",
    "Bash(npm run *)",
    "Bash(npm test*)",
    "Bash(npx vitest *)",
    "Bash(npx prettier *)",
    "Bash(git status*)",
    "Bash(git diff*)",
    "Bash(git log*)",
    "Bash(git show*)",
    "Bash(ls*)",
    ...(work.mode === "pr"
      ? [
          "Bash(git add *)",
          "Bash(git commit *)",
          `Bash(git push -u origin ${work.branch})`,
          "Bash(gh pr create *)",
        ]
      : []),
  ];
}

/**
 * Fixed executable and arguments, in the worktree. Hermes runs in its
 * `hermes-developer` profile (open models only, docs/hermes-open-route.md);
 * Claude Code edits the worktree and runs only `claudeAllowed`; Codex writes
 * the worktree and the repository's git folder, with network only for `pr`.
 */
export function developPlan(
  runner: DevelopmentRunner,
  command: string,
  repo: string,
  work: DevelopWork,
  env: NodeJS.ProcessEnv = process.env,
): LaunchPlan {
  const prompt = developBrief(work);
  const plan = (args: string[], extra: Record<string, string> = {}) => ({
    command,
    args,
    cwd: work.worktree,
    env: { ...baseEnv(env), ...extra },
    stdin: prompt,
  });
  if (runner === "hermes")
    return plan(
      [
        "-p",
        "hermes-developer",
        "chat",
        "--query-file",
        "-",
        "--oneshot",
        "--format",
        "stream-json",
        "--no-restore-cwd",
      ],
      { HERMES_HOME: hermesRootOf(env) },
    );
  if (runner === "claude")
    return plan([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      claudeAllowed(work).join(","),
      "--disallowedTools",
      "mcp__genobi__genobi_submit,mcp__genobi__genobi_develop",
    ]);
  return plan([
    "exec",
    "-c",
    'sandbox_mode="workspace-write"',
    "-c",
    'approval_policy="never"',
    "-c",
    `sandbox_workspace_write.writable_roots=${JSON.stringify([path.join(repo, ".git")])}`,
    "-c",
    `sandbox_workspace_write.network_access=${work.mode === "pr"}`,
    "--json",
    "-",
  ]);
}

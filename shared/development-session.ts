import { z } from "zod";

export const developmentRunner = z.enum(["hermes", "codex", "claude"]);
export type DevelopmentRunner = z.infer<typeof developmentRunner>;
export const developmentRequest = z
  .strictObject({
    runner: developmentRunner,
    mode: z.enum(["fresh", "continue"]),
    previous: z.string().uuid().optional(),
    prompt: z.string().trim().min(1).max(4000),
    handover: z.string().max(8000).optional(),
  })
  .refine(
    (value) =>
      value.mode !== "continue" || (!!value.previous && !value.handover),
    {
      message:
        "Continue needs a previous session; handovers belong to fresh sessions.",
    },
  );
export type DevelopmentRequest = z.infer<typeof developmentRequest>;
export interface DevelopmentSession {
  id: string;
  runner: DevelopmentRunner;
  status:
    | "starting"
    | "running"
    | "stopping"
    | "done"
    | "failed"
    | "stopped"
    | "interrupted";
  startedAt: string;
  prompt: string;
  lines: string[];
  handover: string;
  resumable: boolean;
  /** Set when a creative Genobi session asked for this Developer. */
  startedBy?: { by: "genobi"; agentSession: string };
  /** The Genobi-started Developer's worktree, branch and outcome. */
  develop?: DevelopWork;
}
export interface DevelopmentState {
  runners: { runner: DevelopmentRunner; available: boolean }[];
  sessions: DevelopmentSession[];
}
export const developmentActive = (session: DevelopmentSession) =>
  ["starting", "running", "stopping"].includes(session.status);

/**
 * `genobi_develop`: what a creative Genobi session may ask for. No runner,
 * folder or permission comes from the agent: the runner is the one the
 * person's setup saved, the worktree and branch are the server's.
 */
export const DEVELOP_MODES = ["change", "pr"] as const;
export type DevelopMode = (typeof DEVELOP_MODES)[number];
/** A repository-relative path hint: no leading slash, no `..`, no control characters. */
export const DEVELOP_FILE =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+\-/ ]{1,200}$/;
export const developRequest = z.strictObject({
  role: z.literal("developer"),
  task: z.string().trim().min(1).max(4000),
  files: z.array(z.string().trim().regex(DEVELOP_FILE)).max(20).optional(),
  mode: z.enum(DEVELOP_MODES),
});
export type DevelopRequest = z.infer<typeof developRequest>;
export interface DevelopWork {
  mode: DevelopMode;
  task: string;
  files: string[];
  /** `genobi/develop-<slug>-<id>`, made from origin/main. */
  branch: string;
  /** Under the checkout's `.claude/worktrees/`, never the served checkout. */
  worktree: string;
  /** The origin/main commit the worktree started from, once made. */
  base?: string;
  /** The pull request the Developer reported, `pr` mode only. */
  prUrl?: string;
}
/** What the creative session reads back (`genobi_develop {"id"}`). */
export interface DevelopReceipt {
  id: string;
  runner: DevelopmentRunner;
  status: DevelopmentSession["status"];
  startedAt: string;
  mode: DevelopMode;
  task: string;
  branch: string;
  worktree: string;
  base: string | null;
  prUrl: string | null;
  /** The Developer's final handover, empty until it writes one. */
  summary: string;
  /** The last few progress lines. */
  recent: string[];
}
export const PULL_REQUEST_URL =
  /https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}\/pull\/\d{1,9}/;
export function developReceipt(
  view: DevelopmentSession,
): DevelopReceipt | undefined {
  const work = view.develop;
  if (!work) return undefined;
  return {
    id: view.id,
    runner: view.runner,
    status: view.status,
    startedAt: view.startedAt,
    mode: work.mode,
    task: work.task,
    branch: work.branch,
    worktree: work.worktree,
    base: work.base ?? null,
    prUrl: work.prUrl ?? null,
    summary: view.handover,
    recent: view.lines.slice(-8),
  };
}

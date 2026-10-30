import { execFile } from "node:child_process";
import path from "node:path";

/**
 * A Genobi-started Developer works in its own `git worktree`, made from
 * `origin/main` under the checkout's `.claude/worktrees/` (gitignored), never
 * in the checkout the studio serves: edits there reach the running studio
 * at once, and a half-made change can break a tab the person is using. The
 * branch and folder come from the server; the agent names neither.
 */
export type Git = (args: string[], cwd: string) => Promise<string>;

export const runGit: Git = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, timeout: 120_000, maxBuffer: 1_000_000 },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
    );
  });

/** A few lowercase ASCII words from the task, for the branch name. */
export function taskSlug(task: string) {
  const words = task
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > 40) break;
    slug = next;
  }
  return slug || "change";
}

/** `genobi/develop-<slug>-<8 hex>` and its folder, both from the session id. */
export function developPlace(repo: string, id: string, task: string) {
  const short = id.replace(/-/g, "").slice(0, 8);
  return {
    branch: `genobi/develop-${taskSlug(task)}-${short}`,
    worktree: path.join(
      repo,
      ".claude",
      "worktrees",
      `genobi-develop-${short}`,
    ),
  };
}

/**
 * Fetches main, then adds the worktree on a new branch from `origin/main`.
 * A failed fetch falls back to the last fetched `origin/main` and says so.
 * Answers the base commit and any note for the session's lines.
 */
export async function createWorktree(
  repo: string,
  place: { branch: string; worktree: string },
  git: Git = runGit,
) {
  const notes: string[] = [];
  try {
    await git(["fetch", "origin", "main"], repo);
  } catch {
    notes.push(
      "Could not fetch origin/main; the worktree starts from the last fetched origin/main.",
    );
  }
  await git(
    ["worktree", "add", "-b", place.branch, place.worktree, "origin/main"],
    repo,
  );
  const base = (await git(["rev-parse", "HEAD"], place.worktree)).trim();
  return { base: /^[0-9a-f]{40}$/.test(base) ? base : undefined, notes };
}

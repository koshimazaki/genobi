import { AppError } from "./errors";
import type { StoredJob } from "./store";
import type { KeyMode } from "../shared/types";
import type { TakeStart } from "../shared/take";

export const BUDGET_USD = 5;
export const SESSION_LIMIT = 3;

/**
 * What the demo budget leaves this session today: runs under the per-session
 * limit and dollars under the shared daily budget. Read-only;
 * `requireBudget` holds every demo-key quote and submission to the same
 * numbers, so an agent can check a whole recipe before its first quote. Runs
 * on a visitor's or the owner's own key neither count nor are held, and nor
 * does a free run on a local ComfyUI, whoever's key it records.
 */
export function demoBudget(jobs: readonly StoredJob[], sessionId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const reservations = jobs.filter(
    (job) =>
      job.keyMode === "server" &&
      job.take?.recipe.location !== "local" &&
      job.createdAt.startsWith(today),
  );
  const reserved = reservations.reduce(
    (sum, job) => sum + Math.max(job.costActualUsd ?? 0, job.costEstimateUsd),
    0,
  );
  const used = reservations.filter((job) => job.sessionId === sessionId);
  return {
    sessionLimit: SESSION_LIMIT,
    budgetUsd: BUDGET_USD,
    runsLeft: Math.max(0, SESSION_LIMIT - used.length),
    usdLeft: Math.max(0, Math.round((BUDGET_USD - reserved) * 1e6) / 1e6),
    reservedUsd: reserved,
    countsLocalRuns: false as const,
  };
}

/**
 * The demo budget and per-session limit a demo-key run must fit; a visitor's
 * own key, the owner's saved key and a free local ComfyUI run (`demoBudget`
 * never counts one) are not held to them. It only reads, so a
 * quote runs it too and never promises a run the submission would refuse.
 * Submission runs it again with no await before the reservation, which keeps
 * that atomic.
 */
export function requireBudget(
  jobs: readonly StoredJob[],
  sessionId: string,
  estimate: number,
  mode: KeyMode,
  take: TakeStart,
) {
  if (mode !== "server" || take.recipe.location === "local") return;
  const { runsLeft, reservedUsd } = demoBudget(jobs, sessionId);
  if (runsLeft === 0 || reservedUsd + estimate > BUDGET_USD)
    throw new AppError(
      429,
      "The demo budget is used for today. Add your own key or enjoy the library clips.",
      "budget",
    );
}

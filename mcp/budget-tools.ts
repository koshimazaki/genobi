import { z } from "zod";
import type { BudgetReport } from "../shared/budget";
import type { ToolDefinition } from "./definition";

/**
 * Who pays this agent session's runs, and what the demo budget leaves it
 * today. The MCP server never carries a provider key, so a run uses a key the
 * studio holds. The studio's demo key is held to the per-session run limit
 * and the shared daily dollar budget; a key the owner saved in the studio
 * spends the owner's own credits and is uncapped, so a recipe on it fits by
 * its quoted price alone. Checking a whole recipe here first means no paid
 * run starts that the recipe cannot finish. Reads only; agents never submit.
 */
type Budget = Pick<
  BudgetReport,
  "hasServerKey" | "sessionLimit" | "budgetUsd" | "runsLeft" | "usdLeft"
> &
  Partial<Pick<BudgetReport, "payer" | "uncapped" | "countsLocalRuns">>;

/**
 * `localRuns` of the recipe's `runs` go to a local ComfyUI: free, quoted at
 * $0, and outside the demo budget when the studio says it does not count
 * them, so only the rest is held to the session's run limit.
 */
export function budgetVerdict(
  budget: Budget,
  runs?: number,
  usd?: number,
  localRuns = 0,
) {
  const { hasServerKey, sessionLimit, budgetUsd, runsLeft, usdLeft } = budget;
  const uncapped = hasServerKey && budget.uncapped === true;
  const report = {
    hasServerKey,
    payer: budget.payer ?? (hasServerKey ? "server" : null),
    uncapped,
    countsLocalRuns: budget.countsLocalRuns === false ? false : true,
    sessionLimit,
    budgetUsd,
    runsLeft,
    usdLeft,
  };
  if (runs === undefined && usd === undefined) return report;
  const counted =
    runs === undefined || report.countsLocalRuns
      ? runs
      : Math.max(0, runs - localRuns);
  if (uncapped)
    return {
      ...report,
      fits: true,
      next: `It fits: the owner's own key pays, with no demo limit${usd === undefined ? "" : `, about $${usd.toFixed(2)} by its quotes`}. Quote each step, say the price, and ask the person before any submit.`,
    };
  const short = [
    !hasServerKey && "the studio holds no provider key",
    counted !== undefined &&
      counted > runsLeft &&
      `the recipe needs ${counted} runs${counted !== runs ? " beside its free local ones" : ""} and this session has ${runsLeft} left today`,
    usd !== undefined &&
      usd > usdLeft &&
      `the recipe needs about $${usd.toFixed(2)} and the studio's budget has $${usdLeft.toFixed(2)} left today`,
  ].filter(Boolean);
  return {
    ...report,
    fits: short.length === 0,
    next: short.length
      ? `Do not quote or submit any of it: ${short.join("; ")}. Tell the person; offer a smaller recipe that fits, or another day.`
      : "It fits. Quote each step and ask the person before any submit.",
  };
}

export const budgetTools: ToolDefinition[] = [
  {
    name: "genobi_budget",
    title: "Genobi budget",
    description:
      "Who pays this session's runs and, when the studio's demo key pays, what its demo budget leaves today: runs under the per-session limit and dollars under the daily budget. A key the owner saved is uncapped, so a recipe on it fits by its quoted price alone, and a run on the local ComfyUI is free and not counted. Pass a recipe's runs (and how many of them run locally) and expected dollars to learn whether all of it fits; call it before the first quote and stop if it does not. Reads only.",
    inputSchema: {
      runs: z
        .number()
        .int()
        .min(1)
        .max(24)
        .optional()
        .describe("Paid runs the whole recipe needs"),
      usd: z
        .number()
        .min(0)
        .max(1000)
        .optional()
        .describe("The recipe's expected total in dollars"),
      localRuns: z
        .number()
        .int()
        .min(0)
        .max(24)
        .optional()
        .describe(
          "Of those runs, how many run on the local ComfyUI (genobi_run_location: local): free, and not counted",
        ),
    },
    tags: ["agents", "mcp", "backend"],
    docs: [
      "docs/director-agent-tools.md",
      "docs/run-location.md",
      "plugins/genobi/README.md",
    ],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      const budget = await api.get<Budget>("/api/budget");
      return budgetVerdict(
        budget,
        args.runs as number | undefined,
        args.usd as number | undefined,
        args.localRuns as number | undefined,
      );
    },
  },
];

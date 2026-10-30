/**
 * What `GET /api/budget` (local only) tells an agent before its first quote.
 * The runs and dollars are the demo budget, which holds only the studio's own
 * demo key (`payer: "server"`). When every key the server holds is one the
 * owner saved (`payer: "owner"`), the owner's credits pay and the run is
 * `uncapped`: a recipe fits by its quoted price alone. `payer: null` means
 * the studio holds no key, so nothing fits. A run on a local ComfyUI is free
 * and never counted (`countsLocalRuns: false`), whoever's key it records.
 * Agents never submit either way; the person approves in the studio.
 */
export type BudgetPayer = "owner" | "server" | null;

export interface BudgetReport {
  hasServerKey: boolean;
  payer: BudgetPayer;
  uncapped: boolean;
  sessionLimit: number;
  budgetUsd: number;
  runsLeft: number;
  usdLeft: number;
  /** Dollars already reserved against the daily budget today. */
  reservedUsd: number;
  /** Local ComfyUI runs are free: neither counted nor refused. */
  countsLocalRuns: false;
}

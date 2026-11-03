/**
 * Hosted tester access: an operator-set access code, handed to reviewers with
 * a submission, unlocks a capped number of runs of the two Comfy Deploy
 * workflows on the operator's own deployment. The code is never stored or
 * logged; the browser holds only a short-lived signed token, in page memory
 * like any visitor key. Off unless the operator sets every secret
 * (docs/tester-access.md). Portable: no Node or DOM API.
 */

/**
 * The token travels in the key slot, so every existing request carries it.
 * The Comfy prefix routes the studio to its Comfy models; the Worker swaps the
 * token for the operator's key before any provider call, and only on the
 * deployment routes.
 */
export const TESTER_TOKEN_PREFIX = "comfyui-tester.";
export const isTesterToken = (key: string | undefined) =>
  typeof key === "string" && key.startsWith(TESTER_TOKEN_PREFIX);

/** Long enough for one eight-second deployment run to finish and be saved. */
export const TESTER_TOKEN_TTL_MS = 2 * 3600_000;
export const DEFAULT_TESTER_RUN_CAP = 10;
/** A shorter code is treated as unset: the unlock route stays absent. */
export const MIN_TESTER_CODE_LENGTH = 12;
export const MAX_TESTER_CODE_LENGTH = 256;
export const TESTER_RUNS_USED_UP = "Test runs used up.";

export interface TesterStatus {
  runsLeft: number;
  expiresAt: string;
}

const WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

/** Remaining runs as a sentence, never a bar: "Ten test runs left." */
export function runsLeftWords(runs: number) {
  const n = Math.max(0, Math.floor(runs));
  const count = WORDS[n] ?? String(n);
  return `${count} test run${n === 1 ? "" : "s"} left.`;
}

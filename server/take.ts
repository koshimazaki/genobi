import type { QuoteRecord } from "../shared/quote";
import { takeOf, type TakeRecipe, type TakeStart } from "../shared/take";
import type { Job } from "../shared/types";
import { AppError } from "./errors";

/** One answer for `GET /api/takes/:id` on both adapters. */
export function requireTake(job: Job, start: TakeStart | undefined) {
  if (!start)
    throw new AppError(
      404,
      "This run was recorded before takes existed.",
      "take_missing",
    );
  const take = takeOf(job, start);
  if (!take)
    throw new AppError(409, "This take is not ready yet.", "take_not_ready");
  return take;
}

/**
 * One answer for a submission that names a quote, on both adapters. Callers
 * look up the quote within the session, so another session's id is missing.
 */
export function requireQuote(
  quote: QuoteRecord | undefined,
  settings: string,
  now = Date.now(),
  /** What the run would be now: its route, workflow and run location. */
  recipe?: TakeRecipe,
) {
  if (!quote)
    throw new AppError(
      404,
      "Quote not found. Ask for a new one.",
      "quote_missing",
    );
  if (quote.jobId)
    throw new AppError(
      409,
      "This quote was already spent on another run.",
      "quote_used",
    );
  if (Date.parse(quote.expiresAt) <= now)
    throw new AppError(
      410,
      "This quote expired. Ask for a new one.",
      "quote_expired",
    );
  // Where it goes, before what it is: a key saved since the quote can move a
  // run to another provider with the same settings and payer.
  if (recipe) requireQuotedRun(quote, recipe);
  if (quote.settings !== settings)
    throw new AppError(
      409,
      "This quote was for different settings.",
      "quote_mismatch",
    );
  return quote;
}

/**
 * A quote names the route (Comfy Router, BFL or a workflow), workflow
 * template and run location it priced; spending it under another (a key
 * saved since moved the run to another provider) (the session switched to Cloud, or swapped the graph) is a
 * mismatch, so a free local quote never becomes a charged Cloud run.
 */
export function requireQuotedRun(quote: QuoteRecord, recipe: TakeRecipe) {
  if (quote.recipe.route !== recipe.route)
    throw new AppError(
      409,
      "This quote was for another provider: a key changed since. Ask for a new quote.",
      "route_changed",
    );
  if (
    quote.recipe.workflow !== recipe.workflow ||
    quote.recipe.location !== recipe.location ||
    quote.recipe.deployment?.url !== recipe.deployment?.url
  )
    throw new AppError(
      409,
      "This quote was for another workflow or run location. Ask for a new one.",
      "quote_mismatch",
    );
}

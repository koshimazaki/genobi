import type { Quote } from "../shared/quote";
import type { GenerateInput } from "../shared/types";
import { combinedUsd } from "../shared/upscale-parts";
import { AppError } from "./errors";
import type { JobService } from "./jobs";

/**
 * A split upscale on the demo key is held to the demo budget as a whole: each
 * part's own quote fits alone, but the set must fit too, in runs and dollars,
 * or the person would agree to a set whose later parts the budget refuses. A
 * visitor's or the owner's own key, and a free local run, are not held.
 */
export function partBudget(
  jobs: Pick<JobService, "budget" | "credential">,
  input: GenerateInput,
  sessionId: string,
  quotes: Quote[],
  byoKey?: string,
) {
  const { mode } = jobs.credential(input, sessionId, byoKey);
  if (mode !== "server" || quotes[0]?.recipe.location === "local") return;
  const { runsLeft, usdLeft } = jobs.budget(sessionId);
  if (runsLeft < quotes.length || combinedUsd(quotes) > usdLeft)
    throw new AppError(
      429,
      "The demo budget does not cover every part today. Add your own key or run them on a local ComfyUI.",
      "budget",
    );
}

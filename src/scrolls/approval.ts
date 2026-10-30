import type { Quote } from "../../shared/quote";
import type { GenerateInput } from "../../shared/types";
import type { ScrollGeneration } from "../../shared/scrolls/types";

/** A quoted Scrolls run waiting for the person's Approve. */
export type Approval = {
  quote: Quote;
  input: GenerateInput;
  revision: number;
  cellId?: string;
  idempotency: string;
  /** A Fill panels run, whose result goes into its still-empty panel. */
  fill?: boolean;
  /** The person's own prompt, which the result records. */
  prompt: string;
  /** "Panel 3 (Clash)" or "The sheet", for messages. */
  label: string;
  /** The model and references the result will record. */
  generation: ScrollGeneration;
};

/**
 * What Approve submits: exactly the quoted input, with that quote's id and the
 * one idempotency key made when it was quoted. A changed scroll or an expired
 * quote is refused, so an edit always needs a new quote and a new key.
 */
export function approvedRun(
  approval: Approval | undefined,
  revision: number,
  now = Date.now(),
) {
  if (
    !approval ||
    approval.revision !== revision ||
    Date.parse(approval.quote.expiresAt) <= now
  )
    throw new Error("The quote is stale. Request a new quote.");
  return {
    input: approval.input,
    approval: { quoteId: approval.quote.id, idempotency: approval.idempotency },
  };
}

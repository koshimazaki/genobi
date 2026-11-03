import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import { entryFor } from "../shared/registry";
import { useSettingsStore } from "./settings-store";
import type { GenerateInput } from "../shared/types";
import type { Quote } from "../shared/quote";
import { expectedHeaders } from "./settings-store";
import { request } from "./useJobs";
import { quoteFailure } from "./generation-queue";

/** Quote read only, then an explicit confirmation; a cancel submits nothing. */
export async function deploymentApproval(
  input: GenerateInput,
  key: string,
  confirm: (message: string) => boolean = (message) => window.confirm(message),
  expected: Record<string, string> = expectedHeaders(input),
) {
  const idempotency = crypto.randomUUID();
  const { quote } = await request<{ quote: Quote }>("/api/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-byo-key": key } : {}),
      ...expected,
    },
    body: JSON.stringify(input),
  });
  const name = quote.recipe.deployment?.name;
  if (!name || !quote.billing)
    throw new Error("The studio did not return a deployment quote.");
  return confirm(
    `Run ${quote.recipe.id} on your Comfy deployment ${name}?\n\n${quote.billing}. This is paid GPU time, with no fixed price or cost cap.\n\nConfirm one generation.`,
  )
    ? { quoteId: quote.id, idempotency }
    : null;
}

/**
 * `expected` is the run location and workflow the run was taken with; a
 * queued run passes the ones it was queued under, not the current ones.
 */
export function maybeDeploymentApproval(
  input: GenerateInput,
  key: string,
  expected?: Record<string, string>,
) {
  const location = expected
    ? expected["Genobi-Run-Location"]
    : useSettingsStore.getState().location;
  const deployed =
    isDeployModel(input.model) ||
    (entryFor(input.generator, input.model).route === "workflow" &&
      location === "deployment");
  return deployed
    ? deploymentApproval(input, key, undefined, expected)
    : Promise.resolve(undefined);
}

/**
 * The quote and submission must see the exact same resolved source/settings.
 * Resolves whether it was sent: `false` when the confirmation was declined.
 */
export async function submitWithDeploymentApproval(
  input: GenerateInput,
  key: string,
  send: (
    input: GenerateInput,
    approval: { quoteId: string; idempotency: string } | undefined,
  ) => Promise<unknown>,
  expected?: Record<string, string>,
) {
  // A quote that fails sent nothing: the note must say so (`quoteFailure`).
  const approval = await maybeDeploymentApproval(input, key, expected).catch(
    (error: unknown) => {
      throw quoteFailure(error);
    },
  );
  if (approval === null) return false;
  await send(input, approval);
  return true;
}

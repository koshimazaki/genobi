import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import { entryFor } from "../shared/registry";
import { useSettingsStore } from "./settings-store";
import type { GenerateInput } from "../shared/types";
import { CLOUD_GPU_ESTIMATE, type Quote } from "../shared/quote";
import { expectedHeaders } from "./settings-store";
import { request } from "./useJobs";
import { quoteFailure } from "./generation-queue";

/** Quote read only, then an explicit confirmation; a cancel submits nothing. */
async function readQuote(
  input: GenerateInput,
  key: string,
  expected: Record<string, string> = expectedHeaders(input),
) {
  const { quote } = await request<{ quote: Quote }>("/api/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-byo-key": key } : {}),
      ...expected,
    },
    body: JSON.stringify(input),
  });
  return {
    quote,
    approval: { quoteId: quote.id, idempotency: crypto.randomUUID() },
  };
}

export async function deploymentApproval(
  input: GenerateInput,
  key: string,
  confirm: (message: string) => boolean = (message) => window.confirm(message),
  expected: Record<string, string> = expectedHeaders(input),
) {
  const { quote, approval } = await readQuote(input, key, expected);
  const name = quote.recipe.deployment?.name;
  if (!name || !quote.billing)
    throw new Error("The studio did not return a deployment quote.");
  return confirm(
    `Run ${quote.recipe.id} on your Comfy deployment ${name}?\n\n${quote.billing}. This is paid GPU time, with no fixed price or cost cap.\n\nConfirm one generation.`,
  )
    ? approval
    : null;
}

/** Known availability needs no extra click; unknown is disclosed before spend. */
export async function cloudApproval(
  input: GenerateInput,
  key: string,
  confirm: (message: string) => boolean = (message) => window.confirm(message),
  expected: Record<string, string> = expectedHeaders(input),
) {
  const { quote, approval } = await readQuote(input, key, expected);
  if (quote.recipe.route !== "workflow" || quote.recipe.location !== "cloud")
    throw new Error("The studio did not return a Cloud workflow quote.");
  if (
    quote.availability &&
    !confirm(
      `${quote.availability}\n\n${quote.estimateNote ?? CLOUD_GPU_ESTIMATE}\nEstimated $${quote.estimateUsd.toFixed(2)} on your Comfy key. The run may fail after charging.\n\nContinue with this generation?`,
    )
  )
    return null;
  return approval;
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
    : entryFor(input.generator, input.model).route === "workflow" &&
        location === "cloud"
      ? cloudApproval(input, key, undefined, expected)
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

import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import { entryFor } from "../shared/registry";
import { useSettingsStore } from "./settings-store";
import type { GenerateInput } from "../shared/types";
import type { Quote } from "../shared/quote";
import { expectedHeaders } from "./settings-store";
import { request } from "./useJobs";

/** Quote read only, then an explicit confirmation; a cancel submits nothing. */
export async function deploymentApproval(
  input: GenerateInput,
  key: string,
  confirm: (message: string) => boolean = (message) => window.confirm(message),
) {
  const idempotency = crypto.randomUUID();
  const { quote } = await request<{ quote: Quote }>("/api/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-byo-key": key } : {}),
      ...expectedHeaders(input),
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

export function maybeDeploymentApproval(input: GenerateInput, key: string) {
  const deployed =
    isDeployModel(input.model) ||
    (entryFor(input.generator, input.model).route === "workflow" &&
      useSettingsStore.getState().location === "deployment");
  return deployed ? deploymentApproval(input, key) : Promise.resolve(undefined);
}

/** The quote and submission must see the exact same resolved source/settings. */
export async function submitWithDeploymentApproval(
  input: GenerateInput,
  key: string,
  send: (
    input: GenerateInput,
    approval: { quoteId: string; idempotency: string } | undefined,
  ) => Promise<unknown>,
) {
  const approval = await maybeDeploymentApproval(input, key);
  if (approval !== null) await send(input, approval);
}

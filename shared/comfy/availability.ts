import { composePrompt } from "../presets";
import { entryFor } from "../registry";
import type { TakeRecipe } from "../take";
import type { GenerateInput } from "../types";
import { workflowRun } from "./runs";
import type { WorkflowClient } from "./workflow";

/** The actual run's graph, checked read-only on its current Cloud account. */
export function cloudAvailability(
  client: WorkflowClient,
  input: GenerateInput,
  recipe: TakeRecipe,
  key: string,
) {
  if (
    recipe.route !== "workflow" ||
    recipe.location !== "cloud" ||
    recipe.deployment ||
    !client.availability
  )
    return Promise.resolve(undefined);
  const { template, values } = workflowRun(
    entryFor(input.generator, input.model).model,
    input,
    composePrompt(input),
    recipe.workflow,
    recipe.location,
  );
  return client.availability(template, values, key, {
    location: recipe.location,
  });
}

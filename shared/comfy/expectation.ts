import { AppError } from "../../server/errors";
import type { WorkflowPlan } from "../take";
import { templateById } from "./workflows";
export interface Expectation {
  location?: "local" | "cloud" | "deployment";
  workflow?: string;
}
export function readExpectation(
  location: unknown,
  workflow: unknown,
): Expectation {
  if (
    location !== undefined &&
    location !== "local" &&
    location !== "cloud" &&
    location !== "deployment"
  )
    throw new AppError(
      400,
      "The expected run location must be local, cloud or deployment.",
      "invalid_run_location",
    );
  if (
    workflow !== undefined &&
    (typeof workflow !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(workflow))
  )
    throw new AppError(
      400,
      "The expected workflow is not a template id.",
      "workflow_mismatch",
    );
  return {
    ...(location ? { location } : {}),
    ...(workflow ? { workflow: workflow as string } : {}),
  };
}
export function requireExpectedPlan(
  plan: WorkflowPlan,
  expected?: Expectation,
) {
  if (!expected || !plan.location) return;
  const pinned = Boolean(templateById(plan.workflow)?.template.hosts);
  if (
    (expected.location && !pinned && expected.location !== plan.location) ||
    (expected.workflow && expected.workflow !== plan.workflow)
  )
    throw new AppError(
      409,
      "The run location or workflow changed since you chose it. Check them and try again; nothing was sent or charged.",
      "settings_changed",
    );
}

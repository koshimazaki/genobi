import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";
import { AppError } from "./errors";
import type { WorkflowPlan } from "../shared/take";
import { templateById } from "../shared/comfy/workflows";

/**
 * What a request expects the session's run location and workflow template to
 * be: the studio sends what its controls show (`Genobi-Run-Location`,
 * `Genobi-Workflow`) on every paid write. If the session's settings differ
 * when the run is priced, the request is refused with `409 settings_changed`
 * before anything is reserved, so a run never goes to Cloud while the studio
 * showed Local. A request without them (an MCP client) runs as before.
 */
export interface Expectation {
  location?: "local" | "cloud" | "deployment";
  workflow?: string;
}

const store = new AsyncLocalStorage<Expectation>();
const TEMPLATE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Reads and checks the two headers; a malformed one is a 400. */
export function expectationOf(headers: IncomingHttpHeaders): Expectation {
  const location = one(headers["genobi-run-location"]);
  const workflow = one(headers["genobi-workflow"]);
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
  if (workflow !== undefined && !TEMPLATE.test(workflow))
    throw new AppError(
      400,
      "The expected workflow is not a template id.",
      "workflow_mismatch",
    );
  return {
    ...(location ? { location } : {}),
    ...(workflow ? { workflow } : {}),
  };
}

/**
 * Runs a paid write with the expectation the API middleware read into
 * `response.locals.expected`. Scoped here, around the service call, because a
 * body parser's callbacks do not carry an async context from the middleware.
 */
export const expecting = <T>(
  locals: Record<string, unknown>,
  run: () => Promise<T>,
) => store.run((locals.expected as Expectation | undefined) ?? {}, run);

/**
 * Refuses a workflow plan that is not what the request expected. Called where
 * a run is priced, before anything is reserved; a plan for any other route
 * (empty) is never refused.
 */
export function requireExpected(plan: WorkflowPlan) {
  const expected = store.getStore();
  if (!expected || !plan.location) return;
  // A template with its own hosts never follows the studio's Local or Cloud.
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

import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";
import {
  readExpectation,
  requireExpectedPlan,
  type Expectation,
} from "../shared/comfy/expectation";
export type { Expectation } from "../shared/comfy/expectation";
import type { WorkflowPlan } from "../shared/take";

/**
 * What a request expects the session's run location and workflow template to
 * be: the studio sends what its controls show (`Genobi-Run-Location`,
 * `Genobi-Workflow`) on every paid write. If the session's settings differ
 * when the run is priced, the request is refused with `409 settings_changed`
 * before anything is reserved, so a run never goes to Cloud while the studio
 * showed Local. A request without them (an MCP client) runs as before.
 */
const store = new AsyncLocalStorage<Expectation>();
const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Reads and checks the two headers; a malformed one is a 400. */
export function expectationOf(headers: IncomingHttpHeaders): Expectation {
  const location = one(headers["genobi-run-location"]);
  const workflow = one(headers["genobi-workflow"]);
  return readExpectation(location, workflow);
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
  requireExpectedPlan(plan, store.getStore());
}

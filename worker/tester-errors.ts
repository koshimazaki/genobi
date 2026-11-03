import { AppError } from "../server/errors";
import { TESTER_RUNS_USED_UP } from "../shared/tester";

/** Tester access runs the two deploy workflows on the operator's endpoint only. */
export const testerDeploymentOnly = () =>
  new AppError(
    403,
    "Test access runs the two Comfy Deploy workflows on the Genobi test deployment only. Unlock it again in Settings if you changed the endpoint.",
    "tester_scope",
  );

export const testerRunsUsedUp = () =>
  new AppError(403, TESTER_RUNS_USED_UP, "tester_runs_used_up");

/** No detail: a wrong code, an expired token and a revoked code read alike. */
export const testerRefused = () =>
  new AppError(401, "Access code not accepted.", "tester_refused");

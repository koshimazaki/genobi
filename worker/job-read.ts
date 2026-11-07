import type { GenerateInput, Job } from "../shared/types";
import { canonicalInput } from "../shared/idempotency";
import { AppError } from "../server/errors";
import { withoutDeployTickets } from "./deployments";
import type { JobRow } from "./storage";

export const publicJob = (row: JobRow): Job =>
  withoutDeployTickets(JSON.parse(row.data) as Job);
export function duplicate(row: JobRow, input: GenerateInput) {
  if (canonicalInput(JSON.parse(row.input)) !== canonicalInput(input))
    throw new AppError(
      409,
      "That request identifier was already used with different settings.",
    );
  return publicJob(row);
}

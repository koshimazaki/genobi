import type { z } from "zod";
import type { Job } from "../shared/types";
import type { GenobiApi } from "./api";
import { jobProgressLine } from "../shared/progress-line";

/** One MCP tool: its schema, its MCP annotations and what it asks the studio. */
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** Optional object-level validation for action-dependent fields. */
  inputObject?: z.ZodObject;
  /** Wiki tags from docs/tags.md; the registry (`npm run registry`) checks them. */
  tags: string[];
  /** Repository paths of the pages that document the tool, such as `docs/run-location.md`. */
  docs: string[];
  /**
   * Spends the person's money, behind a quote the person accepted:
   * `genobi_submit` and the split upscale's two confirm tools.
   */
  paid?: true;
  annotations: {
    readOnlyHint: boolean;
    idempotentHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
  run: (api: GenobiApi, args: Record<string, unknown>) => Promise<unknown>;
}

export const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A job as an agent needs it: no provider handles, prompt bounded. */
export function jobSummary(job: Job) {
  return {
    id: job.id,
    status: job.status,
    prompt:
      job.prompt.length > 160 ? `${job.prompt.slice(0, 157)}…` : job.prompt,
    model: job.model ?? null,
    progress: job.progress ?? null,
    // The studio's own line; show it to the person as the job moves.
    progressLine: jobProgressLine(job),
    createdAt: job.createdAt,
    estimateUsd: job.costEstimateUsd,
    actualUsd: job.costActualUsd ?? null,
    resultUrl: job.resultUrl ?? null,
    error: job.error ?? null,
  };
}

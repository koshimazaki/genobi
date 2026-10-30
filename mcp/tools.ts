import { arenaTools } from "./arena-tools";
import { worldTools } from "./world-tools";
import { memoryTools } from "./memory-tools";
import { licenceTools } from "./licence-tools";
import { scrollsTools } from "./scrolls-tools";
import { sceneTools } from "./scene-tools";
import { z } from "zod";
import { registry } from "../shared/registry";
import {
  modelFamilies,
  weightPreferences,
  executionPreferences,
  agentPreferences,
  parseSelection,
  matchesSelection,
  runLocations,
} from "../shared/licensing/selection";
import type { Job } from "../shared/types";
import { audioTools } from "./audio-tools";
import { budgetTools } from "./budget-tools";
import { directorTools } from "./director-tools";
import { generationTools } from "./generation";
import { machineTools } from "./machine-tools";
import { mediaTools } from "./media-tools";
import { provenanceTools } from "./provenance-tools";
import { registryTools } from "./registry-tools";
import { docsTools } from "./docs-tools";
import { developTools } from "./develop-tools";
import { skillTools } from "./skill-tools";
import { takeTools } from "./take-tools";
import { upscalePartsTools } from "./upscale-parts-tools";
import { templateTools } from "./template-tools";
import { workflowTools } from "./workflow-tools";
import { JOB_ID, jobSummary, type ToolDefinition } from "./definition";

export { jobSummary, type ToolDefinition } from "./definition";

// Reading tools never spend. The paid tools in ./generation never spend in one
// call either: genobi_submit needs a quote the person accepted (docs/agent-approvals.md).
const readTools: ToolDefinition[] = [
  {
    name: "genobi_status",
    title: "Genobi status",
    description:
      "Check that the local Genobi studio is running and whether it holds a provider key and generation budget.",
    inputSchema: {},
    tags: ["agents", "mcp", "backend"],
    docs: ["docs/agent-sessions.md", "plugins/genobi/README.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api) {
      const health = await api.get<{
        ok: boolean;
        hasServerKey: boolean;
        budgetUsd: number;
        sessionLimit: number;
      }>("/api/health");
      return { studio: api.base.origin, ...health };
    },
  },
  {
    name: "genobi_models",
    title: "Genobi models",
    description:
      "List creative models with route, task, open-weight flag and supported run locations. Optional selection filters family, weights and local/cloud independently; preferred agent host does not change model eligibility. A match is a static capability, not installed-model/credential readiness or licence clearance. No match means ask or change the plan, never silently ignore preferences. Cloud and open weights can coexist; paid calls still need approval.",
    inputSchema: {
      selection: z
        .object({
          family: z.enum(modelFamilies).optional(),
          weights: z.enum(weightPreferences).optional(),
          execution: z.enum(executionPreferences).optional(),
          agent: z.enum(agentPreferences).optional(),
        })
        .optional(),
      status: z
        .enum(["ready", "coming"])
        .optional()
        .describe("Only ready models, or only models not yet runnable"),
    },
    tags: ["agents", "mcp", "models"],
    docs: ["docs/agent-sessions.md", "docs/hermes-runs.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(_api, args) {
      const selection = parseSelection(args.selection ?? {});
      return registry
        .filter((e) => !args.status || e.status === args.status)
        .filter((e) => matchesSelection(e, selection))
        .map((e) =>
          e.status === "ready"
            ? {
                id: e.id,
                label: e.label,
                task: e.task ?? null,
                family: e.family,
                open: e.open,
                status: e.status,
                route: e.route,
                runLocations: runLocations(e),
                model: e.model,
              }
            : {
                id: e.id,
                label: e.label,
                family: e.family,
                open: e.open,
                status: e.status,
                note: e.note,
              },
        );
    },
  },
  {
    name: "genobi_jobs",
    title: "Genobi jobs",
    description:
      "List recent generation jobs in this agent's Genobi session, newest first, with status, cost and result link.",
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional(),
    },
    tags: ["agents", "mcp", "backend"],
    docs: ["docs/agent-sessions.md", "docs/hermes-runs.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      const { jobs } = await api.get<{ jobs: Job[] }>("/api/history");
      return jobs.slice(0, (args.limit as number) ?? 20).map(jobSummary);
    },
  },
  {
    name: "genobi_job",
    title: "Genobi job",
    description:
      "Check one job's progress. Safe to repeat: it never submits or pays, though a finished clip is saved locally when first seen.",
    inputSchema: {
      id: z.string().regex(JOB_ID).describe("Job id from genobi_jobs"),
    },
    // Polling can save a finished clip locally: a write, but safe to repeat.
    tags: ["agents", "mcp", "backend"],
    docs: ["docs/agent-sessions.md", "docs/hermes-runs.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      const { job, needsKey } = await api.get<{
        job: Job;
        needsKey?: boolean;
      }>(`/api/jobs/${encodeURIComponent(String(args.id))}`);
      return { ...jobSummary(job), ...(needsKey ? { needsKey } : {}) };
    },
  },
];

export const tools: ToolDefinition[] = [
  ...readTools,
  ...licenceTools,
  ...scrollsTools,
  ...sceneTools,
  ...worldTools,
  ...arenaTools,
  ...budgetTools,
  ...generationTools,
  ...upscalePartsTools,
  ...directorTools,
  ...memoryTools,
  ...templateTools,
  ...takeTools,
  ...provenanceTools,
  ...audioTools,
  ...mediaTools,
  ...workflowTools,
  ...machineTools,
  ...developTools,
  ...skillTools(),
  ...registryTools(),
  ...docsTools(),
];

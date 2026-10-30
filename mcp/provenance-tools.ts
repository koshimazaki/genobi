import { z } from "zod";
import { COPY_ID } from "../shared/director/commands";
import type { Project } from "../shared/director/types";
import {
  AGENT_PROVIDERS,
  HARNESSES,
  MAX_GENERATIONS,
} from "../shared/provenance";
import { buildProvenance } from "../shared/provenance-card";
import {
  provenanceBadge,
  provenanceMarkdown,
} from "../shared/provenance-render";
import { toHex, type Take } from "../shared/take";
import type { Job } from "../shared/types";
import { StudioError, type GenobiApi } from "./api";
import { JOB_ID, type ToolDefinition } from "./definition";

/**
 * The provenance card for an example (issue #15): read each take, the jobs'
 * finish times and, when asked, the output bytes to hash, then build and check
 * the card in `shared/provenance-card.ts`. Only reads; never submits or pays.
 */
const MAX_MEDIA_BYTES = 512 * 1024 * 1024;

/**
 * When a Ready job finished: from the history, or, for a job older than the
 * history's latest 50, from the job itself. A finished job is answered from
 * the studio's record without a provider call. Undefined when neither
 * answers, and the card then says its timing is unavailable.
 */
async function finishedAt(api: GenobiApi, jobs: Job[], id: string) {
  const listed = jobs.find((job) => job.id === id);
  if (listed) return listed.updatedAt;
  try {
    const { job } = await api.get<{ job: Job }>(
      `/api/jobs/${encodeURIComponent(id)}`,
    );
    return job.status === "Ready" ? job.updatedAt : undefined;
  } catch {
    return undefined;
  }
}

export const provenanceTools: ToolDefinition[] = [
  {
    name: "genobi_provenance",
    title: "Genobi provenance card",
    description:
      "Build the provenance card for finished takes: the agent and its model, every generation model, workflow files, where it ran and on what, time taken, cost, outputs with SHA-256 hashes, and the tier (open, semi-open, premium) derived from the models. Returns the card, its Markdown and a small gallery summary. Reads only; never submits or pays.",
    inputSchema: {
      title: z.string().max(80).describe("What the example is called"),
      jobIds: z
        .array(z.string().regex(JOB_ID))
        .min(1)
        .max(MAX_GENERATIONS)
        .describe("The Ready jobs that made it, in the order they ran"),
      copyId: z
        .string()
        .regex(COPY_ID)
        .optional()
        .describe(
          "The project's copyId, to record the template it follows; the card reads nothing else from it",
        ),
      skill: z
        .string()
        .max(200)
        .optional()
        .describe(
          "The skill followed, for example plugins/genobi/skills/product-video/SKILL.md",
        ),
      agent: z
        .object({
          harness: z.enum(HARNESSES),
          model: z
            .string()
            .max(100)
            .nullable()
            .optional()
            .describe(
              "The agent's model id, for example deepseek/deepseek-v4.1-flash",
            ),
          provider: z
            .enum(AGENT_PROVIDERS)
            .optional()
            .describe("local when the model runs on this machine"),
          open: z
            .boolean()
            .optional()
            .describe(
              "Open weights; needed when LICENCES.md does not record the model",
            ),
        })
        .describe("Who did the work: you, and the model you run on"),
      workflows: z
        .enum(["cloud", "local"])
        .optional()
        .describe(
          "Where workflow-route takes ran when a take does not record it (older takes): Comfy Cloud (default) or a local ComfyUI. Takes record their own run location and template.",
        ),
      hardware: z
        .string()
        .max(120)
        .describe(
          "What the generations ran on, for example 'Comfy Cloud GPUs' or 'RTX 5090, 32 GB'",
        ),
      startedAt: z
        .string()
        .optional()
        .describe("When the session started (ISO)"),
      finishedAt: z.string().optional().describe("When it finished (ISO)"),
      hashOutputs: z
        .boolean()
        .optional()
        .describe("Read each output and record its SHA-256 (default true)"),
    },
    tags: ["agents", "mcp", "verification"],
    docs: ["docs/hermes-runs.md", "docs/director-agent-tools.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      const jobIds = args.jobIds as string[];
      const { jobs } = await api.get<{ jobs: Job[] }>("/api/history");
      const takes = [];
      for (const id of jobIds) {
        const { take } = await api
          .get<{ take: Take }>(`/api/takes/${encodeURIComponent(id)}`)
          .catch((error) => {
            if (error instanceof StudioError && error.code === "take_not_ready")
              throw new Error(
                `Job ${id} has no take yet; a card covers Ready jobs only. Check it with genobi_job.`,
                { cause: error },
              );
            throw error;
          });
        takes.push({ take, finishedAt: await finishedAt(api, jobs, id) });
      }
      const hashes: Record<string, string> = {};
      const unread: string[] = [];
      if (args.hashOutputs !== false)
        for (const output of takes.flatMap(({ take }) => take.outputs)) {
          if (!output.available) {
            unread.push(`${output.assetId}: media no longer stored`);
            continue;
          }
          try {
            const bytes = await api.bytes(
              `/api/clips/${encodeURIComponent(output.assetId)}`,
              MAX_MEDIA_BYTES,
            );
            hashes[output.assetId] = toHex(
              await crypto.subtle.digest("SHA-256", bytes),
            );
          } catch (error) {
            unread.push(
              `${output.assetId}: ${error instanceof Error ? error.message : "unreadable"}`,
            );
          }
        }
      let template: string | null = null;
      if (args.copyId) {
        const read = await api.get<{ project: Project }>(
          `/api/projects/${encodeURIComponent(String(args.copyId))}`,
        );
        template = read.project.template?.id ?? null;
      }
      const card = buildProvenance({
        title: String(args.title),
        template,
        skill: (args.skill as string | undefined) ?? null,
        agent: args.agent as Parameters<typeof buildProvenance>[0]["agent"],
        workflows: (args.workflows as "cloud" | "local" | undefined) ?? "cloud",
        hardware: String(args.hardware),
        takes,
        hashes,
        startedAt: args.startedAt as string | undefined,
        finishedAt: args.finishedAt as string | undefined,
      });
      return {
        card,
        markdown: provenanceMarkdown(card),
        badge: provenanceBadge(card),
        ...(unread.length ? { unhashed: unread } : {}),
        ...(card.time
          ? {}
          : {
              timing:
                "Unavailable: a take's finish time could not be read. Pass startedAt and finishedAt if you kept them.",
            }),
      };
    },
  },
];

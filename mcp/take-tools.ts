import { z } from "zod";
import { COPY_ID } from "../shared/director/commands";
import type { Derivation } from "../shared/director/types";
import { MEDIA_SOURCE_ID } from "../shared/media-limits";
import { StudioError } from "./api";
import { JOB_ID, type ToolDefinition } from "./definition";

/**
 * The handoff from an agent's take, or its own cut, to the person's project.
 * The MCP server runs in its own studio session, so its takes and media tool
 * results never appear in the person's history; this copies a Ready take or
 * a trim, join, crossfade or room it owns into the linked project copy as an
 * asset, which the studio then shows. Spends nothing.
 */
const inputSchema = {
  id: z
    .string()
    .regex(JOB_ID)
    .optional()
    .describe("A Ready job's id, for a take; leave out with sourceId"),
  sourceId: z
    .string()
    .regex(MEDIA_SOURCE_ID)
    .optional()
    .describe(
      "A video or audio result of genobi_media_trim, _concat, _crossfade or _space, for your own cut; leave out with id",
    ),
  outputId: z
    .string()
    .regex(MEDIA_SOURCE_ID)
    .optional()
    .describe(
      "With id, select an output assetId from genobi_take.outputs (for example companion audio). Omit for the primary output.",
    ),
  copyId: z.string().regex(COPY_ID).describe("The linked project's copyId"),
  baseRevision: z
    .number()
    .int()
    .min(1)
    .describe("The revision genobi_project returned"),
};

/** Exactly one of `id` and `sourceId`, stated in the schema as well. */
const inputObject = z
  .strictObject(inputSchema)
  .superRefine((input, ctx) => {
    if ((input.id === undefined) === (input.sourceId === undefined))
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: "Give id (a take) or sourceId (a media result), not both.",
      });
    if (input.outputId !== undefined && input.id === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["outputId"],
        message: "outputId requires a take id.",
      });
  })
  .meta({ oneOf: [{ required: ["id"] }, { required: ["sourceId"] }] });

export const takeTools: ToolDefinition[] = [
  {
    name: "genobi_take_to_project",
    title: "Genobi take to project",
    description:
      "Hand a Ready take you made (id), or a video or audio result of your own media tools (sourceId: a trim, concat, crossfade or space), into the Director project you linked: the studio copies its clip, still, song or cut into that project as a production asset, at the revision you read, and the person sees it. A result's record names its operation and inputs, each input the project already holds as an input asset; hand the takes it was cut from in first so the project names them. A result built from media your session does not own is refused. Returns the assetId to place, for example with genobi_director_command replace-plate (a clip) or add-clip on an audio track (a song or audio cut). Never submits or pays; the same file twice answers with the same asset.",
    inputSchema,
    inputObject,
    tags: ["agents", "mcp", "director", "bundle", "dual-editor"],
    docs: [
      "docs/director-agent-tools.md",
      "docs/director-bundle/README.md",
      "docs/dual-editor.md",
    ],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      const derived = args.sourceId !== undefined;
      try {
        const added = await api.post<{
          assetId: string;
          revision: number;
          added: boolean;
          kind?: "video" | "image" | "audio";
          derivation?: Derivation;
        }>(`/api/projects/${encodeURIComponent(String(args.copyId))}/takes`, {
          ...(derived ? { sourceId: args.sourceId } : { jobId: args.id }),
          ...(args.outputId === undefined ? {} : { outputId: args.outputId }),
          baseRevision: args.baseRevision,
        });
        const audio =
          added.kind === "audio" ||
          added.derivation?.sources[0]?.kind === "audio";
        return {
          ...added,
          next: audio
            ? `Place it with genobi_director_command at baseRevision ${added.revision}, for example {op: 'add-clip', layerId: '<new id>', assetId: '${added.assetId}', track: '<audio track or new>', startFrame: 0, durationFrames: <frames>}.`
            : `Place it with genobi_director_command at baseRevision ${added.revision}, for example {op: 'replace-plate', layerId: 'shot-<shotId>', assetId: '${added.assetId}'}.`,
        };
      } catch (error) {
        if (error instanceof StudioError && error.code === "revision_conflict")
          throw new Error(
            `${error.message} Read the project again with genobi_project and hand the ${derived ? "result" : "take"} in at its revision.`,
            { cause: error },
          );
        throw error;
      }
    },
  },
];

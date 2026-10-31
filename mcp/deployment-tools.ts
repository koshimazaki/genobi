import { z } from "zod";
import { DEPLOY_FILE_TOKENS } from "../shared/comfy/deploy-input";
import {
  deploymentInputLimit,
  validDeploymentFile,
} from "../shared/comfy/deploy-file";
import type { RunLocationState } from "../shared/comfy/run-location";
import { WORLD_FILES } from "../shared/world-control";
import { projectAssetSchema, readProjectAsset } from "./project-assets";
import { readLocalFile } from "./local-file";
import type { ToolDefinition } from "./definition";

const shape = {
  token: z.enum(DEPLOY_FILE_TOKENS),
  contentType: z.enum([
    "video/webm",
    "image/png",
    "image/jpeg",
    "image/webp",
    "audio/wav",
    "audio/flac",
    "audio/mpeg",
  ]),
  filePath: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe(
      "External agents only: an absolute regular-media-file path on this machine.",
    ),
  projectAsset: projectAssetSchema
    .optional()
    .describe("An asset of a project this session owns or linked."),
  worldFile: z
    .strictObject({
      session: z.string().uuid(),
      file: z.enum(
        Object.keys(WORLD_FILES) as [
          keyof typeof WORLD_FILES,
          ...(keyof typeof WORLD_FILES)[],
        ],
      ),
    })
    .optional()
    .describe("A capture file of a World session paired with genobi_world."),
};
const inputObject = z
  .strictObject(shape)
  .superRefine((v, ctx) => {
    if (
      [v.filePath, v.projectAsset, v.worldFile].filter((x) => x !== undefined)
        .length !== 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Name exactly one filePath, projectAsset or worldFile.",
      });
  })
  .meta({
    oneOf: [
      { required: ["filePath"] },
      { required: ["projectAsset"] },
      { required: ["worldFile"] },
    ],
  });

export const deploymentTools: ToolDefinition[] = [
  {
    name: "genobi_deployment_stage",
    title: "Stage a Comfy deployment input",
    description:
      "Upload one media input to the session's registered Comfy deployment. Use filePath (external agents only), a linked projectAsset, or a paired worldFile. Returns a session/endpoint-bound ticket for deploy.assets[token] in genobi_quote. Tickets expire after two hours or become unusable after switching endpoints; re-stage only when refused. No generation is submitted and no provider key is returned. The deployment's storage/billing policies apply to uploads.",
    inputSchema: shape,
    inputObject,
    tags: ["agents", "mcp", "workflows", "comfy"],
    docs: ["docs/run-location.md", "docs/comfy-deploy.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async run(api, args) {
      const input = inputObject.parse(args);
      if (input.filePath && api.agentSession)
        throw new Error(
          "A studio-started agent must use a linked project asset or paired World file.",
        );
      const state = await api.get<RunLocationState>(
        "/api/settings/run-location",
      );
      if (!state.deployment)
        throw new Error(
          api.agentSession
            ? "Ask the person to register a Comfy deployment in Settings, then start a session with that destination."
            : "Register a Comfy deployment with genobi_run_location first.",
        );
      const limit = deploymentInputLimit(state.deploymentInputBytes);
      const bytes = input.filePath
        ? await readLocalFile(input.filePath, limit)
        : input.projectAsset
          ? (await readProjectAsset(api, input.projectAsset, limit)).bytes
          : await api.bytes(
              `/api/world/${input.worldFile!.session}/files/${input.worldFile!.file}`,
              limit,
            );
      if (!validDeploymentFile(input.token, input.contentType, bytes))
        throw new Error(
          "The input file's bytes, media type and deployment token do not match.",
        );
      const { id } = await api.postBytes<{ id: string }>(
        `/api/settings/deployment-assets/${input.token}`,
        bytes,
        input.contentType,
      );
      return {
        token: input.token,
        id,
        maxAgeSeconds: 7200,
        next: "Use this ticket in deploy.assets under its token, then quote the complete deployment input. Quote and submit in this same session; a changed endpoint or expired ticket requires staging again.",
      };
    },
  },
];

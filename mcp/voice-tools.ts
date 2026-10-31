import { z } from "zod";
import { inspectAudio, MAX_AUDIO_BYTES } from "../shared/audio";
import { VOICE_LANGUAGES } from "../shared/voice-languages";
import { MEDIA_SOURCE_ID } from "../shared/media-limits";
import { projectAssetSchema, readProjectAsset } from "./project-assets";
import { readLocalFile } from "./local-file";
import type { ToolDefinition } from "./definition";

const shape = {
  filePath: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe(
      "External agents only: an absolute path to WAV, FLAC or MP3 on this machine.",
    ),
  sourceId: z
    .string()
    .regex(MEDIA_SOURCE_ID)
    .optional()
    .describe("An audio source the session may read."),
  projectAsset: projectAssetSchema
    .optional()
    .describe("An audio asset of a linked project."),
  language: z.enum(["auto", ...VOICE_LANGUAGES]).optional(),
};
const inputObject = z
  .strictObject(shape)
  .superRefine((v, ctx) => {
    if (
      [v.filePath, v.sourceId, v.projectAsset].filter((x) => x !== undefined)
        .length !== 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Name exactly one filePath, sourceId or projectAsset.",
      });
  })
  .meta({
    oneOf: [
      { required: ["filePath"] },
      { required: ["sourceId"] },
      { required: ["projectAsset"] },
    ],
  });
const docs = ["docs/voice-mode.md", "docs/genobi-cli.md"];

export const voiceTools: ToolDefinition[] = [
  {
    name: "genobi_voice_status",
    title: "Local voice status",
    description:
      "Read local speech-to-text availability, supported languages and recording limit. No model is installed or started. Voice transcription requires the local Genobi server.",
    inputSchema: {},
    tags: ["agents", "mcp", "sound"],
    docs,
    annotations: { readOnlyHint: true, idempotentHint: true },
    run: (api) => api.get("/api/voice/status"),
  },
  {
    name: "genobi_voice_transcribe",
    title: "Transcribe local audio",
    description:
      "Transcribe a WAV, FLAC or MP3 with the local voice worker. Read genobi_voice_status first. Name a session audio source, linked project audio asset, or (external agents only) a local file. Bytes and duration are bounded before transcription; no provider API, generation, or prompt execution is performed. Returns the transcript for review before another action.",
    inputSchema: shape,
    inputObject,
    tags: ["agents", "mcp", "sound"],
    docs,
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    async run(api, args) {
      const input = inputObject.parse(args);
      if (input.filePath && api.agentSession)
        throw new Error(
          "A studio-started agent must use a readable audio source or linked project audio asset.",
        );
      const status = await api.get<{
        available: boolean;
        maxSeconds: number;
        setup?: string;
      }>("/api/voice/status");
      if (!status.available)
        throw new Error(
          status.setup || "Set up voice in the local studio first.",
        );
      const bytes = input.filePath
        ? await readLocalFile(input.filePath, MAX_AUDIO_BYTES)
        : input.projectAsset
          ? (
              await readProjectAsset(
                api,
                input.projectAsset,
                MAX_AUDIO_BYTES,
                "audio",
              )
            ).bytes
          : await api.bytes(`/api/clips/${input.sourceId!}`, MAX_AUDIO_BYTES);
      const audio = await inspectAudio(
        bytes.length,
        async (at, length) => bytes.slice(at, at + length).buffer,
      );
      if (
        !Number.isFinite(status.maxSeconds) ||
        audio.duration > status.maxSeconds
      )
        throw new Error(
          "The recording exceeds this voice worker's duration limit.",
        );
      const query = input.language
        ? `?language=${encodeURIComponent(input.language)}`
        : "";
      return api.postBytes(
        `/api/voice/transcribe${query}`,
        bytes,
        audio.contentType,
      );
    },
  },
];

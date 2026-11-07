import { createHash } from "node:crypto";
import { z } from "zod";
import { COPY_ID } from "../shared/director/commands";
import {
  MEDIA_RECEIPT_ID,
  PROJECT_MEDIA_STAGE_BYTES,
  PROJECT_MEDIA_TYPES,
  type ProjectMediaReceipt,
} from "../shared/project-media";
import { readLocalFile } from "./local-file";
import type { ToolDefinition } from "./definition";
import { linkedMediaWrite } from "../shared/project-media-command";

const copyId = z
  .string()
  .regex(COPY_ID)
  .describe("The destination copyId this session owns or linked");
const receiptId = z
  .string()
  .regex(MEDIA_RECEIPT_ID)
  .describe("The SHA-256 receiptId returned by staging");
const route = (copy: unknown, receipt: unknown) =>
  `/api/projects/${encodeURIComponent(String(copy))}/media/${String(receipt)}` as const;

export const projectMediaTools: ToolDefinition[] = [
  {
    name: "genobi_project_media",
    title: "Edit project media",
    description:
      "Attach a staged receipt, replace selected clips from one, relink clips to an existing asset, alias an asset's role, or remove an unused asset. Requires the linked copyId, exact baseRevision and a fresh requestId UUID. Uses the browser's import/placement rules; preserves clip timing and transforms, locks, media roles, provenance and prompt reference checks. Returns resulting assetIds/layerIds and applied revision. Retry only the exact same requestId and body after a lost answer; it reads the stored result without repeating the edit, even after a human edit. currentRevision may then differ from the applied revision. Conflicts require a fresh read and new requestId. Local server only; no paid generation.",
    inputSchema: linkedMediaWrite.shape,
    inputObject: linkedMediaWrite,
    tags: ["agents", "mcp", "director", "bundle"],
    docs: ["docs/project-media.md", "docs/director-agent-tools.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: true,
    },
    async run(api, args) {
      const { copyId, ...body } = linkedMediaWrite.parse(args);
      return api.post(
        `/api/projects/${encodeURIComponent(copyId)}/media`,
        body,
      );
    },
  },
  {
    name: "genobi_project_media_stage",
    title: "Stage owned project media",
    description:
      "Inspect and stage one local image, audio file or MP4 for a linked Director project. External agents only: studio-started agents cannot read arbitrary local files. Sends bounded bytes, never the machine path. Returns a hash-addressed receipt bound to this session and project for one hour; exact retry or receipt read is safe after a lost acknowledgement. Does not attach media, modify a project revision, generate or pay. Local server only.",
    inputSchema: {
      copyId,
      filePath: z
        .string()
        .min(1)
        .max(4096)
        .describe(
          "Absolute path to a regular local media file; stays inside the adapter",
        ),
      contentType: z
        .enum(PROJECT_MEDIA_TYPES)
        .describe("The declared type; the server checks the actual bytes"),
    },
    tags: ["agents", "mcp", "director", "bundle"],
    docs: ["docs/project-media.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      if (api.agentSession)
        throw new Error(
          "A studio-started agent cannot read arbitrary local files. Ask the person to import the file into their project; use linked project media or owned takes.",
        );
      // Check access before reading a potentially large local file.
      await api.get(`/api/projects/${encodeURIComponent(String(args.copyId))}`);
      const bytes = await readLocalFile(
        args.filePath,
        PROJECT_MEDIA_STAGE_BYTES,
      );
      const sha = createHash("sha256").update(bytes).digest("hex");
      return api.postBytes<{ receipt: ProjectMediaReceipt; stored: boolean }>(
        route(args.copyId, sha),
        bytes,
        String(args.contentType),
      );
    },
  },
  {
    name: "genobi_project_media_receipt",
    title: "Read a staged media receipt",
    description:
      "Read and verify a staged file's receipt in the same session and linked project. Safe after an interrupted acknowledgement. Missing, expired, corrupt or another session's receipt is refused. A receipt is temporary staging, not an attached project asset. Local server only.",
    inputSchema: { copyId, receiptId },
    tags: ["agents", "mcp", "director", "bundle"],
    docs: ["docs/project-media.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      return api.get(route(args.copyId, args.receiptId));
    },
  },
];

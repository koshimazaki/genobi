import { ARENA_MAX_BYTES } from "../shared/arena-limits";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { arenaAction, arenaInput, arenaInputShape } from "./arena-input";
import type { ToolDefinition } from "./definition";
import { draftOf, type Arena } from "../shared/arena";
import { patchSlot } from "../shared/arena-run";

export const arenaTools: ToolDefinition[] = [
  {
    name: "genobi_arena",
    title: "Compare workflow results in Arena",
    description:
      "Compare two to four approaches (video or image) with prompts, observations and a preferred result. Link with the studio's one-use code first. Actions: list, create, read, update (revision + full draft), set_slot (change one approach by id: label, prompt, notes, model, workflow, guide, entry), add (copy studio media by sourceId: an upload, a finished run's job id or a catalogue clip; with slot it becomes that approach's result, without it a reference), upload (a local MP4/PNG/JPEG/WebP; slot optional), request_run (ask the person to run approaches). Run entries: ltx-2-5-fast, ltx-2-5-pro, flux-3-video, flux-3-image (takes the comparison's image references), flux-3-klein-api (BFL), and ltx-2-5-akuspace or flux-3-klein as workflows on the run location (Comfy Cloud or a free local ComfyUI). You never spend: request_run shows the person a Review and run banner that quotes and confirms; the runs then go out together and finished results attach to their approaches. Re-read after changes. A model label records intent, not availability. CLI: genobi arena --input JSON.",
    tags: ["agents", "mcp", "workflows"],
    docs: ["docs/arena.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: arenaInputShape,
    inputObject: arenaInput,
    async run(api, input) {
      const args = arenaAction.parse(input);
      if (args.action === "list") return api.get("/api/arena");
      if (args.action === "link")
        return api.post("/api/arena/link", { code: args.code });
      if (args.action === "create") return api.post("/api/arena", args.draft);
      const id = z.string().uuid().parse(args.id);
      if (args.action === "read") return api.get(`/api/arena/${id}`);
      if (args.action === "add")
        return api.post(`/api/arena/${id}/media`, {
          sourceId: args.sourceId,
          ...(args.slot ? { slot: args.slot } : {}),
        });
      if (args.action === "request_run")
        return api.post(`/api/arena/${id}/run-request`, {
          ...(args.slots ? { slots: args.slots } : {}),
        });
      if (args.action === "set_slot") {
        const { arena } = (await api.get(`/api/arena/${id}`)) as {
          arena: Arena;
        };
        return api.post(`/api/arena/${id}`, {
          revision: arena.revision,
          draft: patchSlot(draftOf(arena), args.slot, args.patch),
        });
      }
      if (args.action === "update")
        return api.post(`/api/arena/${id}`, {
          revision: args.revision,
          draft: args.draft,
        });
      const file = z.string().min(1).max(4096).parse(args.filePath);
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size > ARENA_MAX_BYTES)
        throw new Error("Use a regular media file under 64 MiB.");
      const type: Record<string, string> = {
        ".mp4": "video/mp4",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      };
      const contentType = type[path.extname(file).toLowerCase()];
      if (!contentType) throw new Error("Use MP4, PNG, JPEG or WebP.");
      const bytes = new Uint8Array(await readFile(file));
      if (bytes.length > ARENA_MAX_BYTES)
        throw new Error("Media exceeds 64 MiB.");
      const slot = args.slot ? `&slot=${args.slot}` : "";
      return api.postBytes(
        `/api/arena/${id}/files?name=${encodeURIComponent(path.basename(file))}${slot}`,
        bytes,
        contentType,
      );
    },
  },
];

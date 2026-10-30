import {
  retimeCell,
  type TimingMode,
  type ScrollSnap,
} from "../shared/scrolls/timing";
import { z } from "zod";
import {
  createScroll,
  applyScrollCommand,
  timedCells,
} from "../shared/scrolls/commands";
import { parseScroll } from "../shared/scrolls/types";
import { imageInput, scrollHandoff } from "../shared/scrolls/prompts";
import { FILL_CODE } from "../shared/scrolls/fill";
import type { ToolDefinition } from "./definition";

export const scrollsTools: ToolDefinition[] = [
  {
    name: "genobi_scrolls",
    title: "Scrolls document tools",
    description:
      "Create, inspect or edit a portable character sheet/storyboard, prepare a Klein image request, or prepare selected guidance. Pure JSON transformation: no session storage, media transfer, paid call or agent resume. Save the returned document and open it in Scrolls with its matching media bundle. Edits require the current document revision. Quote a prepared generation with genobi_quote and obtain approval before genobi_submit.",
    inputSchema: {
      action: z.enum([
        "create",
        "inspect",
        "edit",
        "retime",
        "image-request",
        "handoff",
      ]),
      kind: z.enum(["character", "storyboard"]).optional(),
      count: z.number().int().min(1).max(16).optional(),
      id: z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,63}$/)
        .optional(),
      document: z.record(z.string(), z.unknown()).optional(),
      command: z.record(z.string(), z.unknown()).optional(),
      cellId: z.string().optional(),
      revision: z.number().int().min(0).optional(),
      frame: z.number().int().min(0).max(7200).optional(),
      mode: z.enum(["move", "left", "right"]).optional(),
      snap: z.enum(["beat", "frame"]).optional(),
      destination: z.enum(["agent", "video", "director"]).optional(),
    },
    tags: ["agents", "mcp", "director"],
    docs: ["docs/scrolls.md"],
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(_api, args) {
      if (args.action === "create")
        return createScroll(
          args.kind as "character" | "storyboard" | undefined,
          args.count as number | undefined,
          args.id as string | undefined,
        );
      const doc = parseScroll(args.document);
      if (args.action === "edit") return applyScrollCommand(doc, args.command);
      if (args.action === "retime") {
        if (
          args.revision !== doc.revision ||
          typeof args.frame !== "number" ||
          typeof args.cellId !== "string"
        )
          throw new Error(
            "Retiming needs the current revision, cellId and frame.",
          );
        return retimeCell(
          doc,
          args.cellId,
          (args.mode ?? "move") as TimingMode,
          args.frame,
          (args.snap ?? "frame") as ScrollSnap,
        );
      }
      if (args.action === "image-request")
        return imageInput(doc, args.cellId as string | undefined);
      if (args.action === "handoff")
        return scrollHandoff(
          doc,
          (args.destination ?? "agent") as "agent" | "video" | "director",
        );
      return {
        document: doc,
        cuts: timedCells(doc),
        capabilities: {
          liveSession: false,
          imageRequest: "flux-3-klein",
          videoConditioning: false,
          openKleinEditing: false,
          manualRegionBounds: true,
          mp4Preview: "browser",
          requiresMediaBundle: doc.assets.length > 0,
        },
      };
    },
  },
  {
    name: "genobi_scrolls_panels",
    title: "Fill the person's open storyboard panels",
    description:
      "Write the panels of the scroll the person has open in Scrolls, when its Describe the video Send asked you to: the one-use code from your prompt and one entry per panel (cellId, title, camera, action, prompt). Text only, checked whole: unknown cells, duplicates, control characters or over-long fields refuse the call and change nothing. The person sees the panels, edits them and presses Generate board, which quotes as usual. Never generates, quotes or spends. Local studio only.",
    inputSchema: {
      code: z.string().regex(FILL_CODE),
      panels: z
        .array(
          z
            .object({
              cellId: z.string().regex(/^cell-[0-9]{1,3}$/),
              title: z.string().max(80).optional(),
              camera: z.string().max(300).optional(),
              action: z.string().max(300).optional(),
              prompt: z.string().max(1500).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(16),
    },
    tags: ["agents", "mcp", "storyboard"],
    docs: ["docs/scrolls.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    async run(api, args) {
      return api.post("/api/scrolls/fill/panels", {
        code: args.code,
        panels: args.panels,
      });
    },
  },
];

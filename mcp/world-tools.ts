import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import { WORLD_FILES, worldCommand } from "../shared/world-control";
import { COPY_ID } from "../shared/director/commands";
import { NAMED_TAKE_IDS } from "../shared/scene/named-takes";
import {
  RECIPE_REVISION_REQUIRED,
  WORLD_RECIPE_REVISION,
  validRecipeRevision,
} from "../shared/world-recipe-revision";
import type { ToolDefinition } from "./definition";
export const worldTools: ToolDefinition[] = [
  {
    name: "genobi_world",
    title: "Control and record the live World",
    description:
      "Pair with the open World tab using its one-use code. Send bounded character movement and camera controls together, record a live WebM session, or stop. Commands presets / load-preset {name} / takes read the scene library and load a preset into the scene (stops Play; refused in Walk); load-preset takes a preset's name or a move-library file name (fall-cathedral) and returns the loaded recipe. Command recipe returns the current recipe (at most 64 KB of JSON) and its live revision; use that revision as expectedRevision for genobi_world_recipe. Command send-to-project {take} does the library card's Send to Director for a take, by its id or name (the newest of that name): its first frame under Inspirations and the take as MP4 (with its WAV) under Project of the tab's open project, named after the take; it returns each assetId, no project link needed. Command capture {name} runs the Capture button's fixed-frame take from the current recipe (stops Play; refused in Walk, while recording live or while another take is being made): colour WebM, depth WebM and PNG when the renderer has depth, first frame, receipt and any loaded sound as WAV. Its result gives name, frames, width, height, fps, seconds and the files' local API paths; action download saves them. Every capture and live recording also lands in the tab's Takes library. No paid generation; files stay on the local server. Command submission returns an id; read result until done/error. Never resubmit a timed-out command; running may mean its result was lost. Model and FBX files must already be attached in the tab. Files are available through the returned local API paths to the paired session until the next capture or recording, disconnect or expiry.",
    tags: ["3d", "agents", "mcp"],
    docs: ["docs/world-live.md", "docs/world-builder.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      action: z.enum(["link", "command", "result", "download"]),
      code: z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .optional(),
      session: z.string().uuid().optional(),
      id: z.string().uuid().optional(),
      command: worldCommand.optional(),
      directory: z.string().min(1).max(4096).optional(),
    },
    async run(api, args) {
      if (args.action === "link") {
        if (!args.code)
          throw new Error("Use the pairing code from World → Connect agents.");
        return api.post("/api/world/link", { code: args.code });
      }
      if (!args.session)
        throw new Error("Pair with World first and supply its session id.");
      if (args.action === "download") {
        if (typeof args.directory !== "string")
          throw new Error("Supply a new output directory.");
        // The latest live clip or captured take, whichever passes it has.
        const { files } = await api.get<{ files: { file: string }[] }>(
          `/api/world/${args.session}/files`,
        );
        if (!files.length)
          throw new Error("Nothing to download: capture or record first.");
        // Only the session's known names become local file names.
        if (files.some(({ file }) => !Object.hasOwn(WORLD_FILES, file)))
          throw new Error("World listed an unknown file.");
        const data = await Promise.all(
          files.map(({ file }) =>
            api.bytes(
              `/api/world/${args.session}/files/${file}`,
              64 * 1024 * 1024,
            ),
          ),
        );
        const directory = resolve(args.directory);
        await mkdir(directory); // A fresh directory; never overwrite existing files.
        await Promise.all(
          files.map(({ file }, i) =>
            writeFile(join(directory, file), data[i], { flag: "wx" }),
          ),
        );
        return { files: files.map(({ file }) => join(directory, file)) };
      }
      if (args.action === "result") {
        if (!args.id) throw new Error("Supply the command id.");
        return api.get(`/api/world/${args.session}/commands/${args.id}`);
      }
      if (!args.command) throw new Error("Supply a World command.");
      return api.post(`/api/world/${args.session}/commands`, args.command);
    },
  },
];

/**
 * The World Builder recipe hand-off (`server/world-recipe-routes.ts`): one
 * recipe, or a named take, left on a linked project for the person's open
 * World Builder, which applies it as Load recipe would. Free; never a run.
 */
worldTools.push({
  name: "genobi_world_recipe",
  title: "Hand a World Builder recipe to the person's tab",
  description: `Put a World Builder scene recipe into the person's open World Builder on a linked project. First pair with that tab using genobi_world and read its recipe command. action "send" requires expectedRevision from that read, with either take (${NAMED_TAKE_IDS.join(", ")}: a named take; falling-room is the Cathedral, an orbit60 shot, idle then hit then fall, 145 frames, with a dry impact sound) or recipe (a full recipe as window.directorScene.getRecipe returns it; validated with the World Builder's own rules: 8k + 1 frames from 9 to 721, dimensions divisible by 64, at most 24 primitives and 64 KB). The addressed tab applies it only if its live revision still matches; human recipe edits, audio and texture changes invalidate the guard. A conflict is refused without changing the scene: read the current recipe/revision and preserve those edits before a new send. The revision is ephemeral to one mounted tab, not project.revision or a saved recipe field. Another tab leaves it waiting; after a reload, read the new revision before explicitly replacing the handoff. It does not capture. action "status" reads what happened: waiting, applied or refused with the tab's reason. Only the latest recipe is kept. Never resend a waiting recipe. To capture the applied recipe, pair with genobi_world and send its capture command. No paid generation.`,
  tags: ["3d", "agents", "mcp"],
  docs: [
    "docs/world-recipe-handoff.md",
    "docs/world-builder.md",
    "docs/falling-room.md",
  ],
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  inputSchema: {
    action: z.enum(["send", "status"]),
    copyId: z
      .string()
      .regex(COPY_ID)
      .describe("The project's copyId from genobi_projects"),
    take: z.enum(NAMED_TAKE_IDS).optional(),
    recipe: z.record(z.string(), z.unknown()).optional(),
    expectedRevision: z
      .string()
      .regex(WORLD_RECIPE_REVISION)
      .optional()
      .describe(
        "Required for send: revision from genobi_world's recipe command in the target tab. Ephemeral scene identity/edit counter, not the project revision.",
      ),
  },
  async run(api, args) {
    const route =
      `/api/projects/${encodeURIComponent(String(args.copyId))}/world-recipe` as const;
    if (args.action === "status") {
      const read = await api.get<Record<string, unknown>>(`${route}?guarded=1`);
      // The recipe itself is long; the agent sent it and knows it.
      return { ...read, recipe: read.recipe ? "held" : null };
    }
    if ((args.take === undefined) === (args.recipe === undefined))
      throw new Error("Send a take or a recipe, not both.");
    if (!validRecipeRevision(args.expectedRevision))
      throw new Error(RECIPE_REVISION_REQUIRED);
    return api.post(route, {
      ...(args.take !== undefined
        ? { take: args.take }
        : { recipe: args.recipe }),
      expectedRevision: args.expectedRevision,
    });
  },
});

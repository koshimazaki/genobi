import { z } from "zod";
import {
  COPY_ID,
  DIRECTOR_OPS,
  parseCommand,
} from "../shared/director/commands";
import { parseFeedback } from "../shared/director/feedback";
import {
  requiredParameters,
  TRUSTED_RECIPES,
} from "../shared/director/graphic-commands";
import { lanes, laneLabels } from "../shared/director/tracks";
import { assetLabel } from "../shared/director/asset-media";
import {
  directionWords,
  LENSES,
  SHOT_TYPES,
  SUBJECT_ACTIONS,
} from "../shared/director/directions";
import type { GraphicsModule, Layer, Project } from "../shared/director/types";
import type { PromptBrief } from "../src/director/prompt-brief";
import { findHouseTemplate } from "../shared/templates/catalogue";
import type { ToolDefinition } from "./definition";

// The Director through the project copy on the local server: list and read
// the projects this session may see, link one with the code the studio
// shows, and send the small set of Director commands. Nothing here is paid.

interface ProjectRead {
  copyId: string;
  id: string;
  revision: number;
  updatedAt: string;
  project: Project;
  brief: PromptBrief | null;
}

// Two people's projects can share an id (templates reuse them), so an agent
// names a copy by the handle genobi_projects and genobi_link_project return.
const copyId = z
  .string()
  .regex(COPY_ID)
  .describe(
    "The project's copyId from genobi_projects, for example product-video.k7qm2xrpab",
  );

/**
 * How a clip plays and looks: its in-point and gain, its placement (start,
 * and the end it moves to when it has motion) and its recipe parameters.
 */
function clipState(l: Layer) {
  return {
    ...("assetId" in l ? { assetId: l.assetId } : { moduleId: l.moduleId }),
    ...(l.muted ? { muted: true } : {}),
    ...("sourceStartFrame" in l
      ? { sourceStartFrame: l.sourceStartFrame }
      : {}),
    ...("gain" in l ? { gain: l.gain } : {}),
    ...("opacity" in l
      ? {
          placement: {
            position: l.position,
            scale: l.scale,
            opacity: l.opacity,
            rotationDegrees: l.rotationDegrees,
            motion: l.motion ?? null,
          },
        }
      : {}),
    ...("parameters" in l ? { parameters: l.parameters } : {}),
    // The clip's own words and typed directions, apart; absent means none.
    ...(l.prompt ? { prompt: l.prompt } : {}),
    ...(l.directions
      ? {
          directions: l.directions,
          directionWords: directionWords(l.directions),
        }
      : {}),
  };
}

/** A recipe as an agent writes parameters for it: names, types, ranges. */
const recipeSummary = ([id, m]: [string, GraphicsModule]) => ({
  moduleId: id,
  mode: m.mode,
  // The names, types and ranges set-parameters and add-graphic check.
  parameters: m.parameterSchema.properties ?? {},
  required: requiredParameters(m),
});

/** What an agent needs to write a command: tracks, clips, assets, shots. */
export function projectSummary(read: ProjectRead) {
  const p = read.project;
  const all = lanes(p.layers);
  const labels = laneLabels(all);
  return {
    copyId: read.copyId,
    id: p.id,
    name: p.name,
    revision: read.revision,
    updatedAt: read.updatedAt,
    composition: p.composition,
    // The one primary direction for the whole piece; "" when unset.
    globalPrompt: p.globalPrompt ?? "",
    // The earlier prompt brief, kept as context beside the global prompt.
    prompt: read.brief?.text ?? "",
    // Preserve token → asset bindings so model references use the owner's actual files.
    brief: read.brief ?? null,
    template: p.template ?? null,
    preferences: p.preferences ?? null,
    // The revision your last command left, which genobi_project_feedback
    // measures the person's changes from; null before any.
    agentRevision: p.feedbackBase?.project.revision ?? null,
    tracks: all.map((lane) => ({
      track: lane.id,
      label: labels.get(lane.id),
      family: lane.family,
      clips: lane.layers.map((l) => ({
        layerId: l.id,
        name: l.name,
        kind: l.kind,
        startFrame: l.startFrame,
        durationFrames: l.durationFrames,
        locked: l.locked,
        ...clipState(l),
      })),
    })),
    assets: Object.entries(p.assets).map(([id, a]) => ({
      assetId: id,
      // The name it was added under (a World take's name), or null.
      label: assetLabel(a.file.path),
      kind: a.kind,
      use: a.use,
      file: a.file,
      durationSeconds: a.durationSeconds ?? null,
    })),
    recipes: Object.entries(p.modules).map(recipeSummary),
    // Trusted recipes the project does not hold yet: add-graphic brings one
    // in, given every parameter it requires.
    registryRecipes: Object.entries(TRUSTED_RECIPES)
      .filter(([id]) => !Object.hasOwn(p.modules, id))
      .map(recipeSummary),
    // The person's review, and agents' replies: act on the open ones, then
    // resolve them (resolve-note) so the person sees what was done.
    notes: (p.notes ?? []).map((n) => ({
      noteId: n.id,
      frame: n.frame,
      layerId: n.layerId ?? null,
      text: n.text,
      author: n.author ?? null,
      createdAt: n.createdAt ?? null,
      resolved: n.resolved ?? false,
    })),
    shots: p.generationPlans.map((g) => {
      const shotId = g.id.replace(/^plan-/, "");
      // A camera a command set, else the template's own move.
      const camera =
        g.camera ??
        findHouseTemplate(p.template?.id)?.shots.find((s) => s.id === shotId)
          ?.camera ??
        null;
      return {
        shotId,
        plateAssetId: g.replaceAssetId,
        camera,
        prompt: g.prompt,
      };
    }),
  };
}

export const directorTools: ToolDefinition[] = [
  {
    name: "genobi_projects",
    title: "Genobi Director projects",
    description:
      "List the Director projects this agent may see: the studio mirrors its open project to the local server, and the person links it here with a code (genobi_link_project).",
    inputSchema: {},
    tags: ["agents", "mcp", "director"],
    docs: ["docs/agent-sessions.md", "docs/director-bundle/README.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api) {
      return (await api.get<{ projects: unknown[] }>("/api/projects")).projects;
    },
  },
  {
    name: "genobi_link_project",
    title: "Link a Genobi project",
    description:
      "Link the Director project the person is editing, with the eight-character code the studio shows under JSON editor & agent tools. One use, ten minutes.",
    inputSchema: {
      code: z
        .string()
        .regex(/^[A-Za-z0-9-]{8,9}$/)
        .describe("The link code from the studio, for example K7QM-2XRP"),
    },
    // Spending the code twice links nothing more.
    tags: ["agents", "mcp", "director"],
    docs: ["docs/agent-sessions.md", "docs/director-bundle/README.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      return (
        await api.post<{ project: unknown }>("/api/projects/link", {
          code: args.code,
        })
      ).project;
    },
  },
  {
    name: "genobi_project",
    title: "Genobi Director project",
    description:
      "Read one Director project: revision, globalPrompt, tracks/clips with timing, placement, parameters, prompts and directions; assets with assetId, label, kind, use, file path/hash and duration; recipes and registryRecipes; shots; complete brief (text plus reference bindings); and frame notes. Resolve brief.references to assets and pass image references to genobi_quote as projectImageReferences [{copyId,assetId}], in the intended order. The adapter reads the authorized file bytes; never invent references from filenames. Send commands against the revision you read. agentRevision is the revision your last command left; genobi_project_feedback returns the person's changes since then.",
    inputSchema: { copyId },
    tags: ["agents", "mcp", "director", "bundle"],
    docs: [
      "docs/director-bundle/README.md",
      "docs/director-working-version.md",
    ],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      const read = await api.get<ProjectRead>(
        `/api/projects/${encodeURIComponent(String(args.copyId))}`,
      );
      return projectSummary(read);
    },
  },
  {
    name: "genobi_project_feedback",
    title: "Genobi Director feedback",
    description: [
      "Read the person's feedback on your last edit: what they changed in the Director since the revision your last command left (baseRevision), as Director commands in order, each with a label in frames and, with a beat grid, beats and bars ('title 変身 starts 12 frames (0.82 beats) later'); the open frame notes; and unmapped, the changes no command can express, each with its reason.",
      "The commands already hold in the project: apply them to your own record of the edit (your source edit, plan or render) so your next pass keeps the person's changes, and act on the notes and unmapped entries. Read it before your next genobi_director_command: each command you send becomes the new base. baseRevision is null until an agent has edited this project (or wrote the bundle the person opened, with feedbackBase set to its own manifest).",
    ].join(" "),
    inputSchema: { copyId },
    tags: ["agents", "mcp", "director"],
    docs: ["docs/director-agent-tools.md", "docs/director-working-version.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      // Checked as any feedback file is: type, length and counts.
      return parseFeedback(
        await api.get<unknown>(
          `/api/projects/${encodeURIComponent(String(args.copyId))}/feedback`,
        ),
      );
    },
  },
  {
    name: "genobi_director_command",
    title: "Genobi Director command",
    description: [
      "Apply one Director command to a project at the revision you read; the studio shows it live and can undo it. A stale revision is refused with the current one: read the project again and decide afresh. Frames are composition frames.",
      "Commands: add-clip {layerId (new), assetId, track (track id or new), startFrame, durationFrames, name?, sourceStartFrame? (in-point, source frames, audio and video only)};",
      "add-graphic {layerId (new), moduleId, track, startFrame, durationFrames, name?, parameters? {name: value}} (a recipe from recipes or registryRecipes; parameters go over the settings of a layer already using it, and a recipe no layer uses needs every name in its required list, each checked against its type and range);",
      "move-clip {layerId, startFrame, track?}; trim-clip {layerId, startFrame, durationFrames};",
      "set-placement {layerId, position? {x?, y?} (composition pixels from the centre, y down), scale? (0-10], opacity? [0,1], rotationDegrees? [-360,360], motion? {scaleTo?, xTo?, yTo?, opacityTo?} (the end it moves to linearly over the clip) or null} (video, image and graphics layers);",
      "set-parameters {layerId, parameters: {name: value}} (a graphics or filter recipe's declared parameters, text included; genobi_project lists each recipe's names, types and ranges);",
      "set-resolution {width, height} (whole pixels 16-4096 per side, width × height <= 1920 × 1080; presets 960×540, 1280×720, 1920×1080; rescales composition-pixel positions and motion offsets, preserving fitted zoom ratios and timing; for Match assets measure the largest video and fit the current aspect ratio within it and the pixel cap, using even dimensions);",
      "set-beat-grid {bpm? [20,300], beatOffsetSeconds? [0,3600] (where a downbeat falls, in seconds), beatsPerBar? (whole, 1-16)} (at least one; the others keep their value; a genobi_audio_analysis report's composition applies as is, once the person confirms the downbeat);",
      "set-prompt {text} (the earlier prompt brief); set-camera {shotId, camera: {shot-sizes, angles, movements}} (template projects);",
      `set-global-prompt {text} (the project's primary direction, up to 12000 characters; empty clears it); set-clip-prompt {layerId, text} (that clip only, up to 1200 characters; empty clears it); set-clip-directions {layerId, directions: {shot?, lens?, camera?, action?}} (each given field set, null clears it, others kept; shot: ${SHOT_TYPES.map((c) => c.id).join("|")}; lens: ${LENSES.map((c) => c.id).join("|")} (creative feel, not a model parameter); camera: {shot-sizes, angles, movements} as set-camera; action: ${SUBJECT_ACTIONS.map((c) => c.id).join("|")}). Prompts and directions are separate fields: setting one never changes the other, and none of these quotes, submits or regenerates anything. A locked clip refuses them.`,
      "set-preferences {preferences: {selection?: {family?: any|flux|ltx|h3|upscale, weights?: any|open-weights|commercial, execution?: any|local|cloud, agent?: any|hermes|claude|codex}, usage?: {purpose: demo|commercial-video|redistribute-source|resell-template, policy: any-licensed|open-source|mit-only}} or null}. Replaces explicit project preferences; null restores global defaults. Use when asked to remember project choices, not for a temporary session instruction.",
      "set-template-inputs {inputs: {subject?, title?, acoustic?}}; replace-plate {layerId, assetId};",
      "add-note {noteId (new), frame, text (up to 500 characters), layerId?} (a note pinned to a frame and maybe a layer; author and createdAt are filled in); resolve-note {noteId, resolved? (default true; false reopens it)}; delete-note {noteId}.",
    ].join(" "),
    inputSchema: {
      copyId,
      baseRevision: z
        .number()
        .int()
        .min(1)
        .describe("The revision genobi_project returned"),
      command: z
        .object({ op: z.enum(DIRECTOR_OPS as [string, ...string[]]) })
        .passthrough()
        .describe(
          "One command, for example {op: 'move-clip', layerId: 'title', startFrame: 30}",
        ),
    },
    // The base revision makes a repeat a refused conflict, not a second edit;
    // every command stays undoable in the studio.
    tags: ["agents", "mcp", "director", "bundle"],
    docs: ["docs/director-agent-tools.md", "docs/director-bundle/README.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      // Refuse a malformed command here, with the same parser the server runs.
      let command = parseCommand(args.command);
      // A note sent from here is an agent's, written now.
      if (command.op === "add-note")
        command = parseCommand({
          ...command,
          author: "agent",
          createdAt: new Date().toISOString(),
        });
      return api.post<{ revision: number; command: unknown }>(
        `/api/projects/${encodeURIComponent(String(args.copyId))}/commands`,
        { baseRevision: args.baseRevision, command },
      );
    },
  },
];

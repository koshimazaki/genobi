import { z } from "zod";
import { roomAcoustics } from "../shared/scene/acoustics";
import { applyCommand, createScene } from "../shared/scene/commands";
import { parseScene } from "../shared/scene/parse";
import { sceneHandoff } from "../shared/scene/prompts";
import { SCENE_ID } from "../shared/scene/types";
import {
  SCENE_EXAMPLES,
  EXAMPLE_IDS,
  SURROUNDINGS,
  CASTS,
  exampleScene,
} from "../shared/scene/examples";
import { CHARACTER_MODELS } from "../shared/scene/character-catalog";
import { sceneVideoPlan } from "../shared/scene/video-plan";
import type { ToolDefinition } from "./definition";

const vec3 = z.array(z.number()).length(3);

export const sceneTools: ToolDefinition[] = [
  {
    name: "genobi_scene",
    title: "3D scene document tools",
    description:
      "Create, inspect or edit a 3D scene as data (primitives with material and role), add a rectangular room, read its room acoustics (RT60 per band, critical distance, pre-delay, nearest AKUSPACE preset) or a one-paragraph description. Start with examples/example for editable cathedral, house, exploded house, mountain, forest or city sets with a solo/pair neutral mannequin cast and optional surroundings; forest-companion adds one neutral animated pug. The models catalogue lists exact per-asset poses for set-characters edits. video-plan prepares an image-conditioned LTX + AKUSPACE graph, never a submission. Pure JSON transformation: no storage, no code, no paid call. Edits and rooms require the current revision. Save the returned document as a .json file for the person to Load scene in the 3D tab. The acoustics are a readout; nothing applies them to audio yet.",
    inputSchema: {
      action: z.enum([
        "create",
        "inspect",
        "edit",
        "room",
        "acoustics",
        "handoff",
        "examples",
        "example",
        "video-plan",
      ]),
      id: z.string().regex(SCENE_ID).optional(),
      label: z.string().max(200).optional(),
      document: z.record(z.string(), z.unknown()).optional(),
      command: z.record(z.string(), z.unknown()).optional(),
      revision: z.number().int().min(0).optional(),
      room: z
        .object({
          width: z.number(),
          length: z.number(),
          height: z.number(),
          wallMaterial: z.string(),
          floorMaterial: z.string(),
          ceilingMaterial: z.string(),
          door: z
            .object({
              wall: z.enum(["north", "south", "east", "west"]),
              offset: z.number(),
              width: z.number(),
              height: z.number(),
            })
            .optional(),
          openTop: z.boolean().optional(),
        })
        .optional(),
      listener: vec3.optional(),
      example: z.enum(EXAMPLE_IDS).optional(),
      surroundings: z.enum(SURROUNDINGS).optional(),
      cast: z.enum(CASTS).optional(),
      firstFrame: z.string().max(100).optional(),
      referenceAudio: z.string().max(100).optional(),
      duration: z.number().min(1).max(10).optional(),
      camera: z.string().max(500).optional(),
      prompt: z.string().max(1800).optional(),
    },
    tags: ["3d", "agents", "sound", "mcp"],
    docs: ["docs/scene-examples.md", "docs/scene-builder.md", "docs/3d-tab.md"],
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(_api, args) {
      if (args.action === "examples")
        return {
          examples: SCENE_EXAMPLES,
          surroundings: SURROUNDINGS,
          cast: CASTS,
          models: CHARACTER_MODELS,
        };
      if (args.action === "example")
        return exampleScene(args.example, {
          surroundings: args.surroundings,
          cast: args.cast,
        });
      if (args.action === "create")
        return createScene(
          args.id as string | undefined,
          args.label as string | undefined,
        );
      const doc = parseScene(args.document);
      switch (args.action) {
        case "video-plan":
          return sceneVideoPlan(doc, args);
        case "edit":
          return applyCommand(doc, args.command, args.revision);
        case "room":
          return applyCommand(
            doc,
            { op: "room", ...(args.room as object) },
            args.revision,
          );
        case "acoustics":
          return (
            roomAcoustics(
              args.listener
                ? parseScene({ ...doc, listener: args.listener })
                : doc,
            ) ?? {
              acoustics: null,
              reason: "No walls: an open set has no reverb to report.",
            }
          );
        case "handoff":
          return {
            format: "genobi.scene-handoff.v1",
            documentId: doc.id,
            revision: doc.revision,
            text: sceneHandoff(doc),
          };
        default:
          return {
            document: doc,
            acoustics: roomAcoustics(doc),
            capabilities: {
              runsCode: false,
              appliesToAudio: false,
              imageToScene: false,
              loadInStudio: "3D tab, Load scene",
            },
          };
      }
    },
  },
];

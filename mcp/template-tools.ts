import { z } from "zod";
import { cameraSections, type CameraSelection } from "../shared/camera";
import { estimateRunUsd } from "../shared/quote";
import {
  findHouseTemplate,
  houseTemplates,
} from "../shared/templates/catalogue";
import { TIER_LABEL, planTemplate } from "../shared/templates/plan";
import { runKind } from "../shared/templates/run-kind";
import type { ToolDefinition } from "./definition";
import { generationShape } from "./inputs";

/**
 * A house template's runs as an agent quotes them: `planTemplate` (the same
 * planner the Director opens) turned into `genobi_quote` arguments per shot,
 * with the price each would be quoted at. Pure: it reads no studio state and
 * spends nothing, so the template skills can say "quote exactly these".
 */
const ids = houseTemplates.map((t) => t.id) as [string, ...string[]];

/** The shot's run as `genobi_quote` takes it: only the fields it accepts. */
export function quoteArguments(input: object) {
  const fields = input as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(generationShape).flatMap((key) =>
      fields[key] === undefined ? [] : [[key, fields[key]]],
    ),
  );
}

export function templatePlan(
  id: string,
  inputs: unknown = {},
  cameras: Record<string, Partial<CameraSelection>> = {},
) {
  const template = findHouseTemplate(id);
  if (!template) throw new Error(`Unknown template ${id}`);
  const unknown = Object.keys(cameras).find(
    (shot) => !template.shots.some((s) => s.id === shot),
  );
  if (unknown) throw new Error(`${template.name} has no shot ${unknown}`);
  // A camera the project set (genobi_project's shots) replaces the template's.
  const shots = template.shots.map((shot) =>
    cameras[shot.id]
      ? {
          ...shot,
          camera: Object.fromEntries(
            cameraSections.map((s) => [s.id, cameras[shot.id][s.id] ?? null]),
          ) as CameraSelection,
        }
      : shot,
  );
  const plan = planTemplate({ ...template, shots }, inputs);
  const planned = plan.shots.map((shot) => ({
    shotId: shot.id,
    label: shot.label,
    entry: shot.entry.id,
    open: shot.entry.open,
    start: shot.start,
    seconds: shot.seconds,
    estimateUsd: estimateRunUsd(shot.input),
    quote: quoteArguments(shot.input),
  }));
  return {
    template: template.id,
    name: template.name,
    tier: TIER_LABEL[template.tier],
    // A mechanical template is one run the studio's gallery can make in place.
    run: runKind(template),
    inputs: plan.inputs,
    seconds: plan.seconds,
    estimateUsd: planned.reduce((sum, shot) => sum + shot.estimateUsd, 0),
    references: template.references.map((r) => ({
      id: r.id,
      label: r.label,
      kind: r.kind,
      min: r.min,
      max: r.max,
      madeWith: r.madeWith ?? null,
    })),
    shots: planned,
    // World Builder takes: free, captured by the person, never quoted.
    takes: plan.takes.map((take) => ({
      takeId: take.id,
      label: take.label,
      take: take.take,
      start: take.start,
      seconds: take.seconds,
      free: true,
    })),
    next: plan.takes.length
      ? "Quote each shot with genobi_quote using its quote arguments exactly, show the person each price, and submit only what they accept. Takes are free: send each with genobi_world_recipe and let the person capture it."
      : "Quote each shot with genobi_quote using its quote arguments exactly, show the person each price, and submit only what they accept.",
  };
}

export const templateTools: ToolDefinition[] = [
  {
    name: "genobi_template_plan",
    title: "Genobi template plan",
    description: `Plan a house template (${ids.join(", ")}) with the person's inputs: each shot's genobi_quote arguments, length and expected price, from the same planner the Director uses. Pass a shot's camera from genobi_project when a command changed it. An H3 shot's quote still needs its two imageReferences, the sheet then the storyboard. Reads nothing from the studio and spends nothing.`,
    inputSchema: {
      template: z.enum(ids).describe("The template id"),
      inputs: z
        .object({
          subject: z.string().optional(),
          title: z.string().optional(),
          aspect: z.string().optional(),
          bpm: z.number().optional(),
          acoustic: generationShape.acoustic,
        })
        .strict()
        .optional()
        .describe(
          "The template's inputs, as genobi_project's template.inputs shows them; absent ones take the template's defaults",
        ),
      cameras: z
        .record(z.string(), generationShape.camera.unwrap())
        .optional()
        .describe("A camera per shot id, when the project's differs"),
    },
    tags: ["agents", "mcp", "director"],
    docs: [
      "docs/templates.md",
      "docs/director-agent-tools.md",
      "docs/hermes-runs.md",
    ],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(_api, args) {
      return templatePlan(
        String(args.template),
        args.inputs ?? {},
        (args.cameras ?? {}) as Record<string, Partial<CameraSelection>>,
      );
    },
  },
];

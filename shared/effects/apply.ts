import {
  TRUSTED_RECIPES,
  graphicParameters,
  recipeFor,
} from "../director/graphic-commands";
import { refuse } from "../director/layer-commands";
import { laneId } from "../director/tracks";
import {
  checkReferences,
  LAYER_LIMIT,
  type Layer,
  type Project,
} from "../director/types";
import { canonical } from "../memory/state";
import {
  effectFingerprint,
  effectLayerParameters,
  effectParameters,
  inspectEffectPreset,
} from "./catalogue";
import { readEffectApply } from "./command";
import type { ApplyEffectInput, EffectInsertion } from "./types";

/** The composite input must have picture coverage, with no hidden looping. */
function requirePicture(project: Project, input: ApplyEffectInput) {
  const start = input.startFrame;
  const end = start + input.durationFrames;
  const pictures = project.layers.filter(
    (layer) =>
      (layer.kind === "image" || layer.kind === "video") &&
      !layer.muted &&
      (layer.opacity > 0 || (layer.motion?.opacityTo ?? 0) > 0) &&
      (input.sourceLayerId === undefined || layer.id === input.sourceLayerId),
  );
  if (input.sourceLayerId && !pictures.length)
    refuse("The selected source must be a visible image or video layer");
  const intervals = pictures
    .map((l) => [l.startFrame, l.startFrame + l.durationFrames])
    .filter(([a, b]) => b > start && a < end)
    .sort((a, b) => a[0] - b[0]);
  let covered = start;
  for (const [a, b] of intervals) {
    if (a > covered) break;
    covered = Math.max(covered, b);
    if (covered >= end) return;
  }
  refuse(
    "Add an image or video covering the effect's full duration, or shorten the effect",
  );
}

/** One pure, revision-checked edit. The caller commits the whole result once. */
export function applyEffectPreset(
  project: Project,
  value: ApplyEffectInput,
): EffectInsertion {
  const input = readEffectApply(value);
  if (project.revision !== input.expectedRevision)
    refuse("Project changed; reload before applying this preset");
  const preset = inspectEffectPreset(input.presetId);
  if (
    input.startFrame + input.durationFrames >
    project.composition.durationFrames
  )
    refuse("The effect would extend beyond the composition");
  if (project.layers.length + preset.layers.length > LAYER_LIMIT)
    refuse(`A project holds at most ${LAYER_LIMIT} layers`);
  if (preset.input === "composite-below") requirePicture(project, input);
  else if (input.sourceLayerId !== undefined)
    refuse("This preset takes no source layer");
  const parameters = effectParameters(preset, {
    ...input.variant?.parameters,
    ...input.parameters,
  });
  const layerIds = preset.layers.map((l) => `${input.instanceId}-${l.key}`);
  const taken = new Set(project.layers.flatMap((l) => [l.id, laneId(l)]));
  if (layerIds.some((id) => taken.has(id)))
    refuse("Effect instance id is already used; choose a fresh id");
  let next: Project = {
    ...project,
    modules: { ...project.modules },
    layers: [...project.layers],
  };
  for (const [i, definition] of preset.layers.entries()) {
    const trusted = TRUSTED_RECIPES[definition.moduleId];
    const own = next.modules[definition.moduleId];
    if (own && canonical(own) !== canonical(trusted))
      refuse(`Registered effect module changed: ${definition.moduleId}`);
    const loaded = recipeFor(next, definition.moduleId);
    next = loaded.project;
    if (Object.keys(next.modules).length > 32)
      refuse("A project holds at most 32 graphics modules");
    const start = Math.round(input.durationFrames * definition.start);
    const finish = Math.round(
      input.durationFrames * (definition.start + definition.duration),
    );
    if (finish <= start)
      refuse("The effect is too short for its relative layer timing");
    const base = {
      id: layerIds[i],
      name: definition.name,
      startFrame: input.startFrame + start,
      durationFrames: finish - start,
      locked: false,
      muted: false,
      moduleId: definition.moduleId,
      parameters: graphicParameters(
        definition.moduleId,
        trusted,
        undefined,
        effectLayerParameters(definition, parameters),
      ),
    };
    const layer: Layer =
      trusted.mode === "filter"
        ? { ...base, kind: "filter", input: "composite-below" }
        : {
            ...base,
            kind: "graphics",
            opacity: 1,
            position: { x: 0, y: 0 },
            scale: 1,
            rotationDegrees: 0,
          };
    // Respect the preset's declared order: lens/scan before its clean HUD.
    next.layers.push(layer);
  }
  next.revision = project.revision + 1;
  checkReferences(next);
  return {
    project: next,
    instanceId: input.instanceId,
    layerIds,
    presetId: preset.id,
    presetVersion: preset.version,
    family: preset.family,
    fingerprint: effectFingerprint(preset.id, parameters),
  };
}

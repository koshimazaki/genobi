import {
  active,
  type Parameters,
  type Project,
} from "../../shared/director/types";
import {
  inspectEffectPreset,
  type ApplyEffectCommand,
} from "../../shared/effects";

/** Resolve the current edit only when Insert is pressed; never a preview source. */
export function effectInsertionCommand(
  project: Project,
  input: {
    presetId: string;
    instanceId: string;
    frame: number;
    seconds: number;
    parameters: Parameters;
    selectedId?: string | null;
  },
): ApplyEffectCommand {
  const preset = inspectEffectPreset(input.presetId);
  const startFrame = Math.max(
    0,
    Math.min(project.composition.durationFrames - 1, input.frame),
  );
  const durationFrames = Math.max(
    1,
    Math.min(
      project.composition.durationFrames - startFrame,
      Math.round(input.seconds * project.composition.fps),
    ),
  );
  const selected = project.layers.find(
    (layer) => layer.id === input.selectedId,
  );
  const sourceLayerId =
    preset.input !== "none" &&
    selected &&
    ["image", "video"].includes(selected.kind) &&
    active(selected, startFrame)
      ? selected.id
      : undefined;
  return {
    op: "apply-effect-preset",
    presetId: preset.id,
    instanceId: input.instanceId,
    expectedRevision: project.revision,
    startFrame,
    durationFrames,
    parameters: input.parameters,
    ...(sourceLayerId ? { sourceLayerId } : {}),
  };
}

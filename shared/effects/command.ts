import { isObject, refuse } from "../director/layer-commands";
import { effectParameters, inspectEffectPreset } from "./catalogue";
import { readEffectVariant } from "./variants";
import type { ApplyEffectCommand, ApplyEffectInput } from "./types";

export const EFFECT_APPLY_REQUIRED = [
  "presetId",
  "instanceId",
  "expectedRevision",
  "startFrame",
  "durationFrames",
];
export const EFFECT_APPLY_OPTIONAL = ["parameters", "variant", "sourceLayerId"];
const id = /^[a-z][a-z0-9-]{0,63}$/;

export function readEffectApply(value: unknown): ApplyEffectInput {
  if (!isObject(value)) return refuse("Effect application must be an object");
  if (
    Object.keys(value).some(
      (k) => ![...EFFECT_APPLY_REQUIRED, ...EFFECT_APPLY_OPTIONAL].includes(k),
    )
  )
    refuse("Unknown effect application field");
  const missing = EFFECT_APPLY_REQUIRED.find((k) => value[k] === undefined);
  if (missing) refuse(`apply-effect-preset needs ${missing}`);
  if (typeof value.presetId !== "string") refuse("presetId must be text");
  const preset = inspectEffectPreset(value.presetId as string);
  if (
    typeof value.instanceId !== "string" ||
    !/^[a-z][a-z0-9-]{0,43}$/.test(value.instanceId)
  )
    refuse("instanceId must be a fresh lowercase id of at most 44 characters");
  for (const key of ["expectedRevision", "startFrame", "durationFrames"]) {
    const n = value[key];
    if (
      !Number.isSafeInteger(n) ||
      (n as number) < (key === "durationFrames" ? 1 : 0) ||
      (key !== "expectedRevision" && (n as number) > 1_000_000)
    )
      refuse(`${key} must be a valid whole number`);
  }
  if (
    value.sourceLayerId !== undefined &&
    (typeof value.sourceLayerId !== "string" || !id.test(value.sourceLayerId))
  )
    refuse("sourceLayerId must be a lowercase layer id");
  const variant =
    value.variant === undefined ? undefined : readEffectVariant(value.variant);
  if (variant && variant.presetId !== preset.id)
    refuse("Variant belongs to another effect preset");
  const parameters =
    value.parameters === undefined
      ? undefined
      : effectParameters(preset, value.parameters);
  // Keep only overrides here: filling defaults would erase configured variants.
  const overrides =
    parameters &&
    Object.fromEntries(
      Object.keys(value.parameters as object).map((k) => [k, parameters[k]]),
    );
  return {
    presetId: preset.id,
    instanceId: value.instanceId as string,
    expectedRevision: value.expectedRevision as number,
    startFrame: value.startFrame as number,
    durationFrames: value.durationFrames as number,
    ...(overrides ? { parameters: overrides } : {}),
    ...(variant ? { variant } : {}),
    ...(value.sourceLayerId !== undefined
      ? { sourceLayerId: value.sourceLayerId as string }
      : {}),
  };
}

export function readEffectCommand(
  value: Record<string, unknown>,
): ApplyEffectCommand {
  const { op: _op, ...input } = value;
  return { op: "apply-effect-preset", ...readEffectApply(input) };
}

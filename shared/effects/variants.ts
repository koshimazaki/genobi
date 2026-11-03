import { isObject, refuse } from "../director/layer-commands";
import type { Parameters } from "../director/types";
import { effectParameters, inspectEffectPreset } from "./catalogue";
import type { EffectVariant } from "./types";

export const EFFECT_VARIANT_BYTES = 16_384;
const nameOf = (name: unknown): string => {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 80 ||
    /[\x00-\x1f\x7f]/.test(name)
  )
    refuse(
      "Variant name must be 1 to 80 characters without control characters",
    );
  return (name as string).trim();
};

export function createEffectVariant(
  presetId: string,
  name: string,
  parameters: Parameters = {},
): EffectVariant {
  const preset = inspectEffectPreset(presetId);
  return {
    schemaVersion: "genobi.effect-variant.v1",
    presetId,
    presetVersion: preset.version,
    name: nameOf(name),
    parameters: effectParameters(preset, parameters),
    moduleHashes: { ...preset.moduleHashes },
  };
}

/** Imported variants contain bounded configuration, never executable source. */
export function readEffectVariant(value: unknown): EffectVariant {
  if (!isObject(value)) return refuse("An effect variant must be an object");
  const fields = [
    "schemaVersion",
    "presetId",
    "presetVersion",
    "name",
    "parameters",
    "moduleHashes",
  ];
  if (
    Object.keys(value).some((k) => !fields.includes(k)) ||
    fields.some((k) => !Object.hasOwn(value, k))
  )
    refuse("Effect variant fields do not match genobi.effect-variant.v1");
  if (
    value.schemaVersion !== "genobi.effect-variant.v1" ||
    typeof value.presetId !== "string"
  )
    refuse("Unsupported effect variant version or preset");
  const preset = inspectEffectPreset(value.presetId as string);
  if (value.presetVersion !== preset.version)
    refuse("Effect preset version changed; start a new variant");
  const hashes = value.moduleHashes;
  if (
    !isObject(hashes) ||
    Object.keys(hashes).length !== Object.keys(preset.moduleHashes).length ||
    Object.entries(preset.moduleHashes).some(
      ([id, hash]) => hashes[id] !== hash,
    )
  )
    refuse(
      "Effect module identity changed; this variant needs its original registered modules",
    );
  // Saved variants are complete so newer defaults never alter their appearance.
  if (
    !isObject(value.parameters) ||
    preset.controls.some(
      (c) => !Object.hasOwn(value.parameters as object, c.key),
    )
  )
    refuse("A saved effect variant must include every exposed control");
  return createEffectVariant(
    preset.id,
    nameOf(value.name),
    effectParameters(preset, value.parameters),
  );
}

export function parseEffectVariantJson(text: string): EffectVariant {
  if (typeof text !== "string" || text.length > EFFECT_VARIANT_BYTES)
    refuse("Effect variant is too large (16 KB maximum)");
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    if (bytes > EFFECT_VARIANT_BYTES)
      refuse("Effect variant is too large (16 KB maximum)");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return refuse("Effect variant is not valid JSON");
  }
  return readEffectVariant(value);
}

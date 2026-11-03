import { isObject, refuse } from "../director/layer-commands";
import {
  effectParameters,
  inspectEffectPreset,
  listEffectPresets,
} from "./catalogue";
import { createEffectVariant, readEffectVariant } from "./variants";

/** Static public metadata; never reads a user's projects or media. */
export function effectCatalogueResponse(presetId?: unknown) {
  if (presetId === undefined || presetId === null)
    return { presets: listEffectPresets() };
  if (typeof presetId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(presetId))
    return refuse("presetId must be a lowercase catalogue id");
  return { preset: inspectEffectPreset(presetId) };
}

/** Builds a portable variant for the caller to save; no server state is written. */
export function effectVariantResponse(value: unknown) {
  if (!isObject(value)) return refuse("Variant request must be an object");
  if (value.action === "validate") {
    if (Object.keys(value).some((k) => !["action", "variant"].includes(k)))
      refuse("Validate takes only action and variant");
    return { variant: readEffectVariant(value.variant) };
  }
  if (value.action !== "create")
    return refuse("Variant action must be create or validate");
  if (
    Object.keys(value).some(
      (k) => !["action", "presetId", "name", "parameters"].includes(k),
    )
  )
    refuse("Create takes only action, presetId, name and parameters");
  if (typeof value.presetId !== "string")
    return refuse("Create needs a presetId");
  const preset = inspectEffectPreset(value.presetId);
  return {
    variant: createEffectVariant(
      preset.id,
      value.name as string,
      effectParameters(preset, value.parameters ?? {}),
    ),
  };
}

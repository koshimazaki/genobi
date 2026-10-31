import { TRUSTED_RECIPES } from "../director/graphic-commands";
import { isObject, refuse } from "../director/layer-commands";
import type { Parameters } from "../director/types";
import { EFFECT_DEFINITIONS } from "./definitions";
import type { EffectPreset, EffectPresetLayer } from "./types";

/** Copies prevent UI configuration from changing the shared catalogue. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function freeze(value: unknown) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.values(value).forEach(freeze);
  Object.freeze(value);
}
freeze(EFFECT_DEFINITIONS);

export function inspectEffectPreset(id: string): EffectPreset {
  const definition = EFFECT_DEFINITIONS.find((p) => p.id === id);
  if (!definition)
    return refuse(`Unknown effect preset: ${String(id).slice(0, 80)}`);
  const moduleHashes: Record<string, string> = {};
  for (const layer of definition.layers) {
    const module = TRUSTED_RECIPES[layer.moduleId];
    if (!module) refuse(`Effect module ${layer.moduleId} is not registered`);
    moduleHashes[layer.moduleId] = module.file.sha256;
  }
  return clone({ ...definition, moduleHashes });
}

export function listEffectPresets(): EffectPreset[] {
  return EFFECT_DEFINITIONS.map((p) => inspectEffectPreset(p.id));
}

/** Validate exposed controls, then merge with defaults. No source is accepted. */
export function effectParameters(
  preset: EffectPreset,
  value: unknown = {},
): Parameters {
  if (!isObject(value)) return refuse("Effect parameters must be an object");
  const controls = new Map(preset.controls.map((c) => [c.key, c]));
  const out = { ...preset.defaults };
  for (const [key, parameter] of Object.entries(value)) {
    const rule =
      controls.get(key) ??
      refuse(`Unknown effect control: ${key.slice(0, 80)}`);
    switch (rule.type) {
      case "number":
        if (
          typeof parameter !== "number" ||
          !Number.isFinite(parameter) ||
          parameter < rule.min ||
          parameter > rule.max ||
          (rule.integer && !Number.isInteger(parameter))
        )
          refuse(
            `${rule.label} must be ${rule.integer ? "a whole number" : "a number"} from ${rule.min} to ${rule.max}`,
          );
        break;
      case "color":
        if (typeof parameter !== "string" || !/^#[\da-f]{6}$/i.test(parameter))
          refuse(`${rule.label} must be a six-digit hex colour`);
        break;
      case "text":
        if (
          typeof parameter !== "string" ||
          parameter.length > rule.maxLength ||
          /[\x00-\x1f\x7f]/.test(parameter)
        )
          refuse(
            `${rule.label} must be text of at most ${rule.maxLength} characters without control characters`,
          );
        break;
      case "select":
        if (typeof parameter !== "string" || !rule.options.includes(parameter))
          refuse(`${rule.label} must be one of ${rule.options.join(", ")}`);
        break;
      case "boolean":
        if (typeof parameter !== "boolean")
          refuse(`${rule.label} must be true or false`);
        break;
    }
    out[key] = parameter as string | number | boolean;
  }
  return out;
}

export function effectLayerParameters(
  layer: EffectPresetLayer,
  parameters: Parameters,
): Parameters {
  return {
    ...layer.parameters,
    ...Object.fromEntries(
      Object.entries(layer.bindings).map(([key, control]) => [
        key,
        parameters[control],
      ]),
    ),
  };
}

/** Stable configuration identity, while SHA-256 module hashes prove the source. */
export function effectFingerprint(
  presetId: string,
  parameters: Parameters,
): string {
  const preset = inspectEffectPreset(presetId);
  const values = effectParameters(preset, parameters);
  const encoded = JSON.stringify([
    preset.id,
    preset.version,
    preset.moduleHashes,
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key]]),
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < encoded.length; i++) {
    hash ^= encoded.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `effect-v1-${hash.toString(16).padStart(8, "0")}`;
}

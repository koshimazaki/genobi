import { AppError } from "../../server/errors";
import { kleinWorkflow } from "./klein";
import { kleinBaseWorkflow } from "./klein-base";
import { parseModelFile } from "./destination";
import { modelSlots, templateById } from "./workflows";

/**
 * The model files a local ComfyUI loads, by template and model slot:
 * `{ "flux-3-klein-t2i": { "unet_name": "flux3/klein.safetensors" } }`.
 * Read from `GENOBI_LOCAL_MODELS` (a JSON object); `GENOBI_KLEIN_MODEL`
 * still names Klein's `unet_name`. Used on a local destination only; Comfy
 * Cloud keeps the catalogue names in the graph. A refusal names the template
 * and slot, never the file, so a mistyped path stays out of logs.
 */
export type LocalModels = Record<string, Record<string, string>>;

const MAX_MAP = 16_384;
const invalid = (message: string) =>
  new AppError(400, message, "invalid_local_models");

export function parseLocalModels(
  map: unknown,
  kleinModel?: unknown,
  kleinBaseModel?: unknown,
): LocalModels {
  const models: LocalModels = {};
  if (map !== undefined && map !== "") {
    if (typeof map !== "string" || map.length > MAX_MAP)
      throw invalid("GENOBI_LOCAL_MODELS must be a JSON object.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(map);
    } catch {
      throw invalid("GENOBI_LOCAL_MODELS must be a JSON object.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw invalid("GENOBI_LOCAL_MODELS must be a JSON object.");
    for (const [id, slots] of Object.entries(parsed)) {
      const choice = templateById(id);
      if (!choice)
        throw invalid("GENOBI_LOCAL_MODELS names a workflow this build lacks.");
      if (!slots || typeof slots !== "object" || Array.isArray(slots))
        throw invalid(`GENOBI_LOCAL_MODELS: ${id} must map slots to files.`);
      const allowed = modelSlots(choice.template);
      for (const [slot, file] of Object.entries(slots)) {
        if (!allowed.includes(slot))
          throw invalid(
            `GENOBI_LOCAL_MODELS: ${id} has no model slot by that name. It has ${allowed.join(", ")}.`,
          );
        let checked: string | undefined;
        try {
          checked = parseModelFile(file);
        } catch {
          throw invalid(
            `GENOBI_LOCAL_MODELS: the file for ${id}.${slot} must be a .safetensors or .gguf name inside ComfyUI's model folders.`,
          );
        }
        if (checked) (models[id] ??= {})[slot] = checked;
      }
    }
  }
  const klein = parseModelFile(kleinModel);
  if (klein) {
    const set = models[kleinWorkflow.id]?.unet_name;
    if (set && set !== klein)
      throw invalid(
        "GENOBI_KLEIN_MODEL and GENOBI_LOCAL_MODELS name different Klein files. Set it in one place.",
      );
    (models[kleinWorkflow.id] ??= {}).unet_name = klein;
  }
  // A distinct Base override: never apply Distilled weights to the 50-step
  // Base graph, whose expected model and sampler are not interchangeable.
  const base = parseModelFile(kleinBaseModel);
  if (base) {
    const set = models[kleinBaseWorkflow.id]?.unet_name;
    if (set && set !== base)
      throw invalid(
        "GENOBI_KLEIN_BASE_MODEL and GENOBI_LOCAL_MODELS name different Klein Base files. Set it in one place.",
      );
    (models[kleinBaseWorkflow.id] ??= {}).unet_name = base;
  }
  return models;
}

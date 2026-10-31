import { applyEffectPreset, type ApplyEffectInput } from "../../shared/effects";
import { catalogueEffects } from "./catalogue-effects";
import { digest, validateFiles, type Bundle } from "./bundle";

/** Attach only registered source bytes; an imported project never supplies code. */
export async function applyEffectToBundle(
  bundle: Bundle,
  input: ApplyEffectInput,
) {
  const insertion = applyEffectPreset(bundle.project, input);
  const files = new Map(bundle.files);
  for (const layerId of insertion.layerIds) {
    const layer = insertion.project.layers.find((l) => l.id === layerId)!;
    if (!("moduleId" in layer)) throw new Error("Missing effect layer");
    const module = insertion.project.modules[layer.moduleId];
    const registered = catalogueEffects[layer.moduleId];
    if (!registered) throw new Error("Effect source is not registered");
    const bytes = new TextEncoder().encode(registered.source);
    if ((await digest(bytes)) !== module.file.sha256)
      throw new Error(`Effect source changed: ${layer.moduleId}`);
    const existing = files.get(module.file.path);
    if (existing && (await digest(existing)) !== module.file.sha256)
      throw new Error(`Another file occupies ${module.file.path}`);
    files.set(module.file.path, bytes);
  }
  const next = await validateFiles({ project: insertion.project, files });
  const { project: _project, ...receipt } = insertion;
  return {
    bundle: next,
    receipt: {
      ...receipt,
      op: "apply-effect-preset",
      revision: next.project.revision,
    },
  };
}

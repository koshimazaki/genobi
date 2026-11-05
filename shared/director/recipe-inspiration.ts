/**
 * An Inspiration bound to a graphics recipe's image (`asset:<id>` in a
 * parameter the trusted schema declares as a project-image binding) would put
 * a style reference on screen as production media. That is refused where the
 * binding is written, `set-parameters` and `add-graphic`, unless the person
 * asked for it in this request (`allowInspirationAsInput: true`); with the
 * opt-in the binding points at a production copy, the alias `replace-plate`
 * makes. Reading a project never refuses one: a project saved before the rule
 * still opens and edits, and only a new binding is checked.
 */
import { aliasAsset } from "./assets";
import { refuse } from "./layer-commands";
import { INSPIRATION_OPT_IN } from "./reference-role";
import type { Project } from "./types";

/** The production copy of an Inspiration: one fixed id per asset. */
export function productionCopyId(project: Project, assetId: string): string {
  const alias = `${assetId.slice(0, 55)}-plate`;
  const existing = project.assets[alias];
  if (existing && existing.file.sha256 !== project.assets[assetId].file.sha256)
    refuse(`Asset id ${alias} is taken`);
  return alias;
}

/**
 * The layer's named parameters with every new Inspiration binding refused, or,
 * with the opt-in, pointed at its production copy. Production images, values
 * that bind nothing and missing assets (which `checkReferences` names) pass
 * unchanged. The project is cloned before an alias is added.
 */
export function bindRecipeInspirations(
  project: Project,
  layerId: string,
  names: readonly string[],
  allowInspirationAsInput: boolean | undefined,
): Project {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer || !("parameters" in layer)) return project;
  const properties = project.modules[layer.moduleId]?.parameterSchema
    .properties as Record<string, { pattern?: string }> | undefined;
  let next = project;
  for (const name of names) {
    const value = layer.parameters[name];
    if (
      typeof value !== "string" ||
      !value.startsWith("asset:") ||
      !properties?.[name]?.pattern?.includes("asset:")
    )
      continue;
    const id = value.slice(6);
    const asset = project.assets[id];
    if (!asset || asset.use === "production") continue;
    if (allowInspirationAsInput !== true)
      refuse(
        `${id} is an Inspiration, a style reference, so ${layer.name} cannot show it as its ${name} image. Bind a production image, describe what to take from it in the prompt instead, or set ${INSPIRATION_OPT_IN}: true only when the person asked in this request to put this Inspiration in the cut.`,
      );
    if (next === project) next = structuredClone(project);
    const copy = aliasAsset(next, id, "production", productionCopyId(next, id));
    next.layers = next.layers.map((l) =>
      l.id === layerId && "parameters" in l
        ? { ...l, parameters: { ...l.parameters, [name]: `asset:${copy}` } }
        : l,
    );
  }
  return next;
}

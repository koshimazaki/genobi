// What `add-graphic` puts on the timeline: a recipe the project holds, or one
// from the trusted registry that it does not hold yet, with its parameters
// checked against the recipe's own parameter schema. A recipe brought in
// joins the project's modules exactly as the registry defines it, so the
// importer's recipe check (`src/director/validate.ts`) still holds.
import registry from "../../docs/director-bundle/example/studio.json";
import { checkParameters, refuse } from "./layer-commands";
import type { GraphicsModule, Parameters, Project } from "./types";

/**
 * The trusted recipes, by id: the registry every bundle's modules are checked
 * against, and the only recipes an agent can bring into a project.
 */
export const TRUSTED_RECIPES = registry.modules as Record<
  string,
  GraphicsModule
>;

/** The names a recipe's parameter schema requires. */
export const requiredParameters = (module: GraphicsModule): string[] => {
  const required = module.parameterSchema.required;
  return Array.isArray(required) ? required.map(String) : [];
};

/**
 * The recipe `moduleId` names: the project's own, else the registry's, which
 * is added to the project's modules. Its file joins the bundle at the
 * registry's path, so another file already at that path is refused.
 */
export function recipeFor(
  project: Project,
  moduleId: string,
): { project: Project; module: GraphicsModule } {
  const own = project.modules[moduleId];
  if (own) return { project, module: own };
  if (!Object.hasOwn(TRUSTED_RECIPES, moduleId))
    return refuse(
      `No recipe ${moduleId} in this project or the registry; use one of ${Object.keys(TRUSTED_RECIPES).join(", ")}`,
    );
  const module = JSON.parse(
    JSON.stringify(TRUSTED_RECIPES[moduleId]),
  ) as GraphicsModule;
  const clash = [
    ...Object.values(project.assets),
    ...Object.values(project.modules),
  ].some(
    (item) =>
      item.file.path === module.file.path &&
      item.file.sha256 !== module.file.sha256,
  );
  if (clash) refuse(`${module.file.path} already holds another file`);
  return {
    project: {
      ...project,
      modules: { ...project.modules, [moduleId]: module },
    },
    module,
  };
}

/**
 * A new layer's parameters: those given, each checked against the recipe's
 * schema, over the settings of a layer already using the recipe. A recipe no
 * layer uses yet has nothing to copy, so every name it requires is given.
 */
export function graphicParameters(
  moduleId: string,
  module: GraphicsModule,
  copied: Parameters | undefined,
  given: Parameters | undefined,
): Parameters {
  if (given) checkParameters(moduleId, module, given);
  const parameters = { ...copied, ...given };
  const missing = requiredParameters(module).filter(
    (k) => !Object.hasOwn(parameters, k),
  );
  if (missing.length)
    refuse(
      `No layer uses ${moduleId} yet; give its parameters ${missing.join(", ")}`,
    );
  return parameters;
}

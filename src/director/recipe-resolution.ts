import knownProject from "../../docs/director-bundle/example/studio.json";
import type { Layer, Project } from "../../shared/director/types";

// These trusted recipes take literal pixel type sizes. Others (including
// teaser titles/cursors) already derive their sizes from the frame dimensions.
// Identify the recipe by its hash, since imported bundles can rename modules.
const pixelType = new Set([
  knownProject.modules.caption.file.sha256,
  knownProject.modules.title.file.sha256,
  knownProject.modules.kinetic.file.sha256,
]);

/** Keep editable type values in their original coordinate space while drawing
 * the glyphs at the new native canvas resolution. No recipe/schema is rewritten,
 * and historical manifests without designSize draw exactly as recorded.
 */
export function recipeResolution(
  project: Project,
  layer: Extract<Layer, { parameters: unknown }>,
) {
  const { parameters } = layer;
  const { width, height, designSize } = project.composition;
  if (
    !designSize ||
    !pixelType.has(project.modules[layer.moduleId].file.sha256) ||
    typeof parameters.size !== "number"
  )
    return parameters;
  return {
    ...parameters,
    size:
      parameters.size *
      Math.min(width / designSize.width, height / designSize.height),
  };
}

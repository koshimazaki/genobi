import type { Layer, Project } from "./types";

/** Only a trusted parameter schema can declare a project-image binding. */
export function recipeAssetIds(project: Project, layer: Layer): string[] {
  if (!("parameters" in layer)) return [];
  const properties = project.modules[layer.moduleId]?.parameterSchema
    .properties as Record<string, { pattern?: string }> | undefined;
  return Object.entries(layer.parameters).flatMap(([key, value]) =>
    typeof value === "string" &&
    value.startsWith("asset:") &&
    properties?.[key]?.pattern?.includes("asset:")
      ? [value.slice(6)]
      : [],
  );
}

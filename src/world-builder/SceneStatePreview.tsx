import { memo, useMemo } from "react";
import type { Recipe } from "./recipe";
import { projectSceneGeometry } from "./scene-projection";

/** Schematic of authored geometry with its camera; never a capture pass. */
export const SceneStatePreview = memo(function SceneStatePreview({
  recipe,
  frame,
}: {
  recipe: Recipe;
  frame: number;
}) {
  const polygons = useMemo(() => {
    const control = recipe.motion?.morphControl;
    // State cards show the authored sequence even when the live plane holds
    // the scene at a manual origin or routes it toward another destination.
    const authored = control?.enabled
      ? {
          ...recipe,
          motion: {
            ...recipe.motion!,
            morphControl: { ...control, enabled: false },
          },
        }
      : recipe;
    return projectSceneGeometry(authored, frame, 200, 100, false);
  }, [recipe, frame]);
  return (
    <svg viewBox="0 0 200 100" aria-hidden="true" focusable="false">
      <rect width="200" height="100" fill={recipe.background} />
      {polygons.map((p) => {
        const points = p.vertices
          .map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`)
          .join(" ");
        return (
          <g key={p.id}>
            <polygon points={points} fill={p.color} />
            <polygon points={points} fill="#000" opacity={p.shade} />
          </g>
        );
      })}
    </svg>
  );
});

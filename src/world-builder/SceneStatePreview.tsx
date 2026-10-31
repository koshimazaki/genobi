import { useMemo } from "react";
import { Euler, PerspectiveCamera, Vector3 } from "three";
import { cameraAt, cameraTargetAt, type Recipe } from "./recipe";
import { evaluateScene } from "./evaluate-scene";
import { scaledAxes } from "./scene-contract";

const corners = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
const faces = [
  [0, 1, 2, 3],
  [4, 7, 6, 5],
  [0, 4, 5, 1],
  [3, 2, 6, 7],
  [0, 3, 7, 4],
  [1, 5, 6, 2],
];

/** Lightweight schematic of the actual authored geometry; never a capture pass. */
export function SceneStatePreview({
  recipe,
  frame,
}: {
  recipe: Recipe;
  frame: number;
}) {
  const polygons = useMemo(() => {
    const camera = new PerspectiveCamera(recipe.fov, 2, 0.05, 600);
    camera.position.set(...cameraAt(recipe, frame));
    camera.lookAt(...cameraTargetAt(recipe, frame));
    camera.updateMatrixWorld();
    return evaluateScene(recipe, frame, { audio: false })
      .objects.flatMap((p) => {
        const size = scaledAxes(p);
        const rotation = new Euler(
          p.rotationX ?? 0,
          p.rotation ?? 0,
          p.rotationZ ?? 0,
        );
        const points = corners.map(([x, y, z]) => {
          const v = new Vector3(
            (x * size[0]) / 2,
            (y * size[1]) / 2,
            (z * size[2]) / 2,
          )
            .applyEuler(rotation)
            .add(new Vector3(p.x, p.y, p.z));
          const depth = v.clone().applyMatrix4(camera.matrixWorldInverse).z;
          v.project(camera);
          return { x: (v.x + 1) * 100, y: (1 - v.y) * 50, depth };
        });
        return faces.flatMap((face, i) => {
          const vertices = face.map((j) => points[j]);
          if (vertices.some((v) => v.depth >= -0.05)) return [];
          return [
            {
              id: `${p.id}-${i}`,
              color: p.color,
              shade: [0.2, 0.02, 0.35, 0, 0.24, 0.1][i],
              depth: vertices.reduce((sum, v) => sum + v.depth, 0) / 4,
              points: vertices
                .map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`)
                .join(" "),
            },
          ];
        });
      })
      .sort((a, b) => a.depth - b.depth);
  }, [recipe, frame]);
  return (
    <svg viewBox="0 0 200 100" aria-hidden="true" focusable="false">
      <rect width="200" height="100" fill={recipe.background} />
      {polygons.map((p) => (
        <g key={p.id}>
          <polygon points={p.points} fill={p.color} />
          <polygon points={p.points} fill="#000" opacity={p.shade} />
        </g>
      ))}
    </svg>
  );
}

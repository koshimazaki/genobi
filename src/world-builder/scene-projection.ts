import { Euler, PerspectiveCamera, Vector3 } from "three";
import { cameraAt, cameraTargetAt, cameraFovAt, type Recipe } from "./recipe";
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

export function sceneProjectionCamera(
  recipe: Recipe,
  frame: number,
  width: number,
  height: number,
  audio = true,
) {
  const cameraRecipe =
    !audio && recipe.cameraMotion
      ? {
          ...recipe,
          envelope: [],
          bandEnvelopes: { sub: [], low: [], mid: [], high: [] },
          cameraMotion: {
            ...recipe.cameraMotion,
            audio: { ...recipe.cameraMotion.audio, enabled: false },
          },
        }
      : recipe;
  const camera = new PerspectiveCamera(
    cameraFovAt(cameraRecipe, frame),
    width / height,
    0.05,
    600,
  );
  camera.position.set(...cameraAt(cameraRecipe, frame));
  camera.lookAt(...cameraTargetAt(cameraRecipe, frame));
  camera.updateMatrixWorld();
  return camera;
}

/** Schematic box geometry from the real evaluator and camera, without WebGL. */
export function projectSceneGeometry(
  recipe: Recipe,
  frame: number,
  width: number,
  height: number,
  audio = true,
) {
  const camera = sceneProjectionCamera(recipe, frame, width, height, audio);
  return evaluateScene(recipe, frame, { audio })
    .objects.flatMap((p) => {
      if (p.presence === 0) return [];
      const size = scaledAxes(p);
      const rotation = new Euler(
        p.rotationX ?? 0,
        p.rotation ?? 0,
        p.rotationZ ?? 0,
      );
      const points = corners.map(([x, y, z]) => {
        const point = new Vector3(
          (x * size[0]) / 2,
          (y * size[1]) / 2,
          (z * size[2]) / 2,
        )
          .applyEuler(rotation)
          .add(new Vector3(p.x, p.y, p.z));
        const depth = point.clone().applyMatrix4(camera.matrixWorldInverse).z;
        point.project(camera);
        return {
          x: ((point.x + 1) * width) / 2,
          y: ((1 - point.y) * height) / 2,
          depth,
        };
      });
      return faces.flatMap((face, i) => {
        const vertices = face.map((n) => points[n]);
        if (
          vertices.some((v) => v.depth >= -0.05 || !Number.isFinite(v.x + v.y))
        )
          return [];
        return [
          {
            id: `${p.id}-${i}`,
            color: p.color,
            shade: [0.22, 0.02, 0.34, 0, 0.26, 0.1][i],
            depth: vertices.reduce((sum, v) => sum + v.depth, 0) / 4,
            vertices,
          },
        ];
      });
    })
    .sort((a, b) => a.depth - b.depth);
}

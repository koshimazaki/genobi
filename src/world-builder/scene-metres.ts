import { Box3, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Recipe, Shape } from "./recipe";
import { BUILDER_CHARACTER_MODELS } from "./character-catalog";
import { geometryFor } from "./geometry";
import { evaluateScene } from "./evaluate-scene";
import { evaluateAcousticEnvironment } from "./evaluate-acoustic-environment";
import { scaledAxes } from "./scene-contract";
import type { SceneVector } from "./scene-state";

export interface SceneMetres {
  /** Axis-aligned visible primitive extent; excludes the character and studio floor. */
  dimensions: SceneVector;
  /** Only an explicit active enclosure, never a guessed box around decorative blocks. */
  roomDimensions?: SceneVector;
  mannequinHeight: number;
}

const vertices = new Map<Shape, SceneVector[]>();
function shapeVertices(shape: Shape) {
  const cached = vertices.get(shape);
  if (cached) return cached;
  const geometry = geometryFor(shape),
    positions = geometry.getAttribute("position");
  const unique = new Map<string, SceneVector>();
  for (let i = 0; i < positions.count; i++) {
    const vertex: SceneVector = [
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i),
    ];
    unique.set(vertex.join(","), vertex);
  }
  geometry.dispose();
  const values = [...unique.values()];
  vertices.set(shape, values);
  return values;
}

/** Bounds of the same evaluated native primitive vertices used by the WebGL scene. */
export function sceneMetres(recipe: Recipe, frame = 0): SceneMetres {
  const evaluated = evaluateScene(recipe, frame);
  const bounds = new Box3(),
    point = new Vector3();
  for (const part of evaluated.objects) {
    if (part.presence === 0) continue;
    const transform = new Matrix4().compose(
      new Vector3(part.x, part.y, part.z),
      new Quaternion().setFromEuler(
        new Euler(part.rotationX ?? 0, part.rotation ?? 0, part.rotationZ ?? 0),
      ),
      new Vector3(...scaledAxes(part)),
    );
    for (const vertex of shapeVertices(part.shape))
      bounds.expandByPoint(point.set(...vertex).applyMatrix4(transform));
  }
  let roomDimensions = evaluated.room?.dimensions;
  if (recipe.motion?.acousticZones) {
    const environment = evaluateAcousticEnvironment(recipe, frame);
    roomDimensions =
      environment.kind === "room" ? environment.room.dimensions : undefined;
  }
  return {
    dimensions: bounds.getSize(new Vector3()).toArray() as SceneVector,
    ...(roomDimensions
      ? { roomDimensions: [...roomDimensions] as SceneVector }
      : {}),
    mannequinHeight: BUILDER_CHARACTER_MODELS.mannequin.height,
  };
}

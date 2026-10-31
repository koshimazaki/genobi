import { Vector3 } from "three";
import type { Recipe } from "./recipe";
import { sceneProjectionCamera } from "./scene-projection";

/** The same one/five-metre floor grid for labelled geometry previews. */
export function drawGridPreview(
  context: CanvasRenderingContext2D,
  recipe: Recipe,
  frame: number,
  width: number,
  height: number,
  audio = true,
) {
  if (recipe.scene !== "stage" || recipe.stageLook !== "dark-grid") return;
  const camera = sceneProjectionCamera(recipe, frame, width, height, audio);
  const centerX = Math.round(camera.position.x / 5) * 5;
  const centerZ = Math.round(camera.position.z / 5) * 5;
  const draw = (first: Vector3, second: Vector3, major: boolean) => {
    const midpoint = first.clone().add(second).multiplyScalar(0.5);
    const distance = Math.hypot(
      midpoint.x - camera.position.x,
      midpoint.z - camera.position.z,
    );
    const fade = Math.max(0, Math.min(1, (48 - distance) / 38));
    if (!fade) return;
    first.applyMatrix4(camera.matrixWorldInverse);
    second.applyMatrix4(camera.matrixWorldInverse);
    const near = -0.051;
    if (first.z >= near && second.z >= near) return;
    if (first.z >= near)
      first.lerp(second, (near - first.z) / (second.z - first.z));
    if (second.z >= near)
      second.lerp(first, (near - second.z) / (first.z - second.z));
    first.applyMatrix4(camera.projectionMatrix);
    second.applyMatrix4(camera.projectionMatrix);
    if (![first.x, first.y, second.x, second.y].every(Number.isFinite)) return;
    context.beginPath();
    context.moveTo(((first.x + 1) * width) / 2, ((1 - first.y) * height) / 2);
    context.lineTo(((second.x + 1) * width) / 2, ((1 - second.y) * height) / 2);
    context.strokeStyle = `rgba(${major ? "88,105,121" : "57,68,84"},${(major ? 0.62 : 0.4) * fade * fade})`;
    context.lineWidth = major ? 0.8 : 0.55;
    context.stroke();
  };
  context.save();
  for (let line = -45; line <= 45; line++) {
    for (let along = -45; along < 45; along += 5) {
      draw(
        new Vector3(centerX + line, -0.79, centerZ + along),
        new Vector3(centerX + line, -0.79, centerZ + along + 5),
        line % 5 === 0,
      );
      draw(
        new Vector3(centerX + along, -0.79, centerZ + line),
        new Vector3(centerX + along + 5, -0.79, centerZ + line),
        line % 5 === 0,
      );
    }
  }
  context.restore();
}

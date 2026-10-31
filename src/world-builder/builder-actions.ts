import type { WorldRuntime } from "./runtime";
import type { SceneAdapter } from "./scene-adapter";
import type { Recipe, Shape } from "./recipe";
import { png } from "./export-take";
import { withAddedSceneObject } from "./scene-editing";

export async function addBuilderPrimitive(
  adapter: SceneAdapter,
  recipe: Recipe,
  shape: Shape,
) {
  const id = `${shape}-${crypto.randomUUID().slice(0, 8)}`;
  await adapter.configure(
    withAddedSceneObject(recipe, {
      id,
      shape,
      x: recipe.targetX,
      y: 1,
      z: recipe.targetZ,
      scale: 1,
      spin: 0,
      color: "#b7cad8",
      prompt: "",
    }),
  );
  return id;
}

/** Frame-zero PNG shares the take guard and always releases capture state. */
export function builderStill({
  world,
  idle,
  settle,
  lock,
  alive,
  frame,
}: {
  world: WorldRuntime;
  idle(): void;
  settle(): Promise<unknown>;
  lock(value: boolean): void;
  alive(): boolean;
  frame(value: number): void;
}) {
  return async (draw: (value: number) => Promise<HTMLCanvasElement>) => {
    if (world.kind === "geometry")
      throw new Error("Capture needs WebGL; this is a geometry preview.");
    idle();
    if (world.editor?.mode !== "shot")
      throw new Error("Return to Shot mode before capture.");
    lock(true);
    try {
      await settle();
      world.assertMedia();
      world.beginCapture();
      const canvas = await draw(0);
      frame(0);
      return await png(canvas);
    } finally {
      if (alive()) lock(false);
      world.endCapture();
      if (alive()) await world.renderFrame(0);
    }
  };
}

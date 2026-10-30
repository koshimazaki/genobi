import { useEffect, useRef } from "react";
import { drawRadar, poseFromVec3, sizeCanvas } from "./camera-motion-drawing";
import { cameraAt, type Recipe } from "./recipe";
export function MotionView({
  recipe,
  frame,
}: {
  recipe: Recipe;
  frame: number;
}) {
  const top = useRef<HTMLCanvasElement>(null),
    side = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const pose = (n: number, label: string) => {
      const p = cameraAt(recipe, n);
      return poseFromVec3(
        [p[0] - recipe.targetX, p[1] - recipe.targetY, p[2] - recipe.targetZ],
        "reset",
        label,
      );
    };
    const state = {
      start: pose(0, "Start"),
      current: pose(frame, "Now"),
      target: pose(recipe.frames - 1, "End"),
    };
    const draw = () => {
      if (top.current) {
        sizeCanvas(top.current);
        drawRadar(top.current, "top", state, []);
      }
      if (side.current) {
        sizeCanvas(side.current);
        drawRadar(side.current, "side", state, []);
      }
    };
    const resize = new ResizeObserver(draw);
    if (top.current) resize.observe(top.current);
    if (side.current) resize.observe(side.current);
    draw();
    return () => resize.disconnect();
  }, [recipe, frame]);
  return (
    <div className="wb-radars">
      <figure>
        <figcaption>Top path</figcaption>
        <canvas ref={top} aria-label="Top camera path" />
      </figure>
      <figure>
        <figcaption>Side altitude</figcaption>
        <canvas ref={side} aria-label="Side camera path" />
      </figure>
      <progress value={frame} max={recipe.frames - 1} />
    </div>
  );
}

import type { Recipe } from "./recipe";
import type { WorldRuntime } from "./runtime";
import { projectSceneGeometry } from "./scene-projection";
import { drawGridPreview } from "./grid-preview";
import { createGeometryCamera } from "./geometry-camera";

/**
 * Explicitly limited fallback for browsers without WebGL. It evaluates the
 * same primitive/camera animation, but cannot capture, shade, texture or walk.
 */
export function createGeometryPreview(
  canvas: HTMLCanvasElement,
  onEdit: (patch: Partial<Recipe>, frame?: number) => void = () => {},
): WorldRuntime {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot create a geometry preview.");
  let recipe: Recipe,
    frame = 0,
    disposed = false;
  const requireWebGL = (): never => {
    throw new Error(
      "This action needs WebGL. Geometry preview supports scene configuration, audio and playback.",
    );
  };
  const renderFrame = async (value: number) => {
    if (disposed) throw new Error("Scene was closed.");
    frame = value;
    const viewRecipe = controls.previewRecipe(recipe);
    // Keep the browser-only fallback modest even for a 1920 px capture recipe.
    const scale = Math.min(1, 960 / recipe.width);
    canvas.width = Math.round(recipe.width * scale);
    canvas.height = Math.round(recipe.height * scale);
    ctx.fillStyle = recipe.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGridPreview(ctx, viewRecipe, frame, canvas.width, canvas.height);
    const polygons = projectSceneGeometry(
      viewRecipe,
      frame,
      canvas.width,
      canvas.height,
    );
    for (const face of polygons) {
      ctx.beginPath();
      face.vertices.forEach((v, i) =>
        i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y),
      );
      ctx.closePath();
      ctx.fillStyle = face.color;
      ctx.fill();
      ctx.fillStyle = `rgba(0,0,0,${face.shade})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(10,18,22,0.23)";
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }
    if (!polygons.length) {
      ctx.fillStyle = "rgba(10,18,22,0.8)";
      ctx.fillRect(
        canvas.width * 0.13,
        canvas.height / 2 - 25,
        canvas.width * 0.74,
        50,
      );
      ctx.fillStyle = "#edf2eb";
      ctx.font = `${Math.max(14, canvas.width / 42)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        "Choose a scene preset from the gallery below",
        canvas.width / 2,
        canvas.height / 2,
      );
    }
    return canvas;
  };
  const controls = createGeometryCamera(
    canvas,
    () => recipe,
    () => frame,
    () => {
      void renderFrame(frame);
    },
    onEdit,
  );
  return {
    kind: "geometry",
    get frame() {
      return frame;
    },
    get editor() {
      return controls.editor;
    },
    getLayout: (id) => recipe.layout[id],
    configure: (next) => {
      recipe = next;
      controls.reset();
    },
    prepareCharacter: async () => () => {},
    beginCapture: requireWebGL,
    endCapture: () => {},
    appearance: () => undefined,
    renderFrame,
    renderDepthFrame: async () => requireWebGL(),
    previewPose: () => {},
    setMedia: async () => requireWebGL(),
    clearMedia: () => {},
    assertMedia: requireWebGL,
    dispose: () => {
      disposed = true;
      controls.editor.dispose();
    },
  };
}

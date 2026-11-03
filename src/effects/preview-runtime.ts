import * as threejs from "three";
import { effectLayerParameters, type EffectPreset } from "../../shared/effects";
import type { Parameters } from "../../shared/director/types";
import type { GraphicsInstance } from "../director/module-types";
import { catalogueEffects } from "../director/catalogue-effects";
import { FilterHost } from "../director/filter-host";
import { resolveFont } from "../director/font-registry";

let webglAvailable: boolean | undefined;
function canPreviewFilters() {
  if (webglAvailable !== undefined) return webglAvailable;
  try {
    const probe = document.createElement("canvas").getContext("webgl2");
    webglAvailable = !!probe;
    probe?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglAvailable = false;
  }
  return webglAvailable;
}

/** Uses the exact trusted module factories and compositor ordering as export. */
export async function effectPreviewRuntime(
  output: HTMLCanvasElement,
  preset: EffectPreset,
  parameters: Parameters,
  source?: HTMLCanvasElement,
) {
  const width = output.width,
    height = output.height;
  const composite = document.createElement("canvas");
  composite.width = width;
  composite.height = height;
  const ctx = composite.getContext("2d")!;
  let host: FilterHost | undefined;
  let notice = "";
  if (
    preset.layers.some(
      (layer) => catalogueEffects[layer.moduleId]?.mode === "filter",
    )
  ) {
    try {
      if (!canPreviewFilters()) throw new Error("WebGL unavailable");
      host = new FilterHost(composite);
    } catch {
      notice =
        "WebGL is unavailable. This preview shows the source and any title or HUD layers; image filters need WebGL.";
    }
  }
  const instances: { mode: string; instance: GraphicsInstance }[] = [];
  const still = document.createElement("canvas");
  still.width = width;
  still.height = height;
  const stillCtx = still.getContext("2d")!;
  try {
    if (source && source.width && source.height) {
      const scale = Math.min(width / source.width, height / source.height);
      stillCtx.drawImage(
        source,
        (width - source.width * scale) / 2,
        (height - source.height * scale) / 2,
        source.width * scale,
        source.height * scale,
      );
    } else if (preset.input !== "none") {
      const image = new Image();
      image.src = "/media/director-templates/genobi-teaser/still-bloom.jpg";
      await image.decode();
      const scale = Math.max(width / image.width, height / image.height);
      stillCtx.drawImage(
        image,
        (width - image.width * scale) / 2,
        (height - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
    }
    for (const layer of preset.layers) {
      const recipe = catalogueEffects[layer.moduleId];
      if (!recipe) throw new Error("This preset renderer is unavailable.");
      if (recipe.mode === "filter" && !host) continue;
      const values = effectLayerParameters(layer, parameters);
      if (typeof values.font === "string") {
        const font = await resolveFont(
          values.font,
          400,
          String(values.text ?? values.label ?? ""),
        );
        values.font = font.stack;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      instances.push({
        mode: recipe.mode,
        instance: await recipe.create({
          canvas,
          width,
          height,
          parameters: values,
          libraries: { threejs },
          // The registered 2D overlay factories do not use a WebGL renderer.
          renderer: host?.renderer as threejs.WebGLRenderer,
        }),
      });
    }
  } catch (error) {
    for (const item of instances) item.instance.dispose();
    host?.dispose();
    throw error;
  }
  let disposed = false;
  let serial: Promise<void> = Promise.resolve();
  async function draw(timeSeconds: number, compare: boolean) {
    if (disposed) return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(still, 0, 0);
    if (!compare)
      for (const { mode, instance } of instances) {
        if (mode === "filter") {
          host!.texture.needsUpdate = true;
          await instance.render({ timeSeconds, inputTexture: host!.texture });
          if (disposed) return;
          const result = host!.output(instance.output as threejs.Texture);
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(result, 0, 0);
        } else {
          await instance.render({ timeSeconds });
          if (disposed) return;
          ctx.drawImage(instance.output as HTMLCanvasElement, 0, 0);
        }
      }
    if (disposed) return;
    const out = output.getContext("2d")!;
    out.fillStyle = "#111311";
    out.fillRect(0, 0, width, height);
    out.drawImage(composite, 0, 0);
    output.dataset.frame = String(Math.round(timeSeconds * 24));
  }
  return {
    notice,
    render(timeSeconds: number, compare = false) {
      const task = serial.then(() => draw(timeSeconds, compare));
      serial = task.catch(() => {});
      return task;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { instance } of instances) instance.dispose();
      host?.dispose();
      composite.width = composite.height = still.width = still.height = 1;
    },
  };
}

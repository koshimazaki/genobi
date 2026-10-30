import { readFileSync } from "node:fs";
import * as animejs from "animejs";
import * as threejs from "three";
import type { Parameters, Project } from "../shared/director/types";
import type {
  GraphicsContext,
  GraphicsInstance,
} from "../src/director/module-types";

// Runs the motion-effect modules outside a browser: overlays draw into a
// recording 2D context, filters render through a stand-in Three renderer
// while their uniforms are read back. Both are enough to show that a frame
// depends only on its time.

export const effectsProject = (): Project =>
  JSON.parse(
    readFileSync("docs/director-bundle/effects/project.json", "utf8"),
  ) as Project;

/** The worked example's parameters for the first layer using `moduleId`. */
export function defaults(moduleId: string): Parameters {
  const layer = effectsProject().layers.find(
    (l) => "moduleId" in l && l.moduleId === moduleId,
  );
  if (!layer || !("parameters" in layer)) throw new Error(moduleId);
  return { ...layer.parameters };
}

export const WIDTH = 640;
export const HEIGHT = 360;
export const FPS = 30;

type Create = (
  c: GraphicsContext,
) => GraphicsInstance | Promise<GraphicsInstance>;

/** An overlay drawing into a context that records every call and setting. */
export async function overlay(
  create: Create,
  parameters: Parameters,
  [width, height] = [WIDTH, HEIGHT],
) {
  const log: unknown[][] = [];
  const ctx = new Proxy(
    {},
    {
      get(_, key) {
        if (key === "measureText")
          return (text: string) => ({ width: text.length * 10 });
        return (...args: unknown[]) => log.push([key, ...args]);
      },
      set(_, key, value) {
        log.push(["set", key, value]);
        return true;
      },
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  const instance = await create({
    canvas,
    width,
    height,
    parameters,
    libraries: { animejs, threejs },
    renderer: {} as threejs.WebGLRenderer,
  });
  /** The calls one frame makes. */
  async function frame(f: number) {
    log.length = 0;
    await instance.render({ timeSeconds: f / FPS });
    // -0 and 0 draw the same; compare them as one.
    return log.map((entry) =>
      entry.map((v) => (typeof v === "number" ? v + 0 : v)),
    );
  }
  return { instance, frame };
}

/**
 * A filter rendering through a stand-in renderer, which reads the uniforms
 * of the one mesh it is handed: each frame returns them as plain values.
 */
export async function filter(
  create: Create,
  parameters: Parameters,
  [width, height] = [WIDTH, HEIGHT],
) {
  let uniforms: Record<string, unknown> = {};
  const input = new threejs.Texture();
  const renderer = {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: (scene: threejs.Scene) => {
      const mesh = scene.children[0] as threejs.Mesh<
        threejs.BufferGeometry,
        threejs.ShaderMaterial
      >;
      const { source, ...rest } = mesh.material.uniforms;
      if (source.value !== input) throw new Error("Filter lost its input");
      uniforms = Object.fromEntries(
        Object.entries(rest).map(([k, u]) => [
          k,
          typeof u.value?.toArray === "function" ? u.value.toArray() : u.value,
        ]),
      );
    },
  } as unknown as threejs.WebGLRenderer;
  const instance = await create({
    canvas: {} as HTMLCanvasElement,
    width,
    height,
    parameters,
    libraries: { animejs, threejs },
    renderer,
  });
  async function frame(f: number) {
    uniforms = {};
    await instance.render({ timeSeconds: f / FPS, inputTexture: input });
    return uniforms;
  }
  return { instance, frame };
}

/** Each frame rendered in order, then again in a scrambled order. */
export async function seekOrders<T>(
  frame: (f: number) => Promise<T>,
  frames: number[],
) {
  const inOrder = new Map<number, T>();
  for (const f of frames) inOrder.set(f, await frame(f));
  const scrambled = new Map<number, T>();
  for (const f of [...frames].reverse().concat(frames.filter((_, i) => i % 2)))
    scrambled.set(f, await frame(f));
  return { inOrder, scrambled };
}

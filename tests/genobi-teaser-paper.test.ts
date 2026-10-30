// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// Paper's ShaderMount, reduced to what decides the drawing's scale: its
// resize maths (shader-mount.js `handleResize`, @paper-design/shaders
// 0.0.81) over a host whose device-pixel box is its CSS size × the screen's
// devicePixelRatio. jsdom has no WebGL, so the pixels are this scale and the
// arguments the recipe hands over.
const made: { renderScale: number; width: number; args: unknown[] }[] = [];
const MAX = 1920 * 1080 * 4;
vi.mock("@paper-design/shaders", () => {
  class ShaderMount {
    canvasElement = { width: 0, height: 0 };
    resizeObserver = { disconnect: vi.fn() };
    handleVisualViewportChange = () => {};
    renderScale = 0;
    constructor(
      host: HTMLElement,
      _shader: string,
      _uniforms: unknown,
      _attributes: unknown,
      _speed: number,
      _frame: number,
      minPixelRatio = 2,
      maxPixelCount = MAX,
    ) {
      const dpr = Math.max(1, window.devicePixelRatio);
      const cssW = parseFloat(host.style.width),
        cssH = parseFloat(host.style.height);
      const w = cssW * dpr * Math.max(1, minPixelRatio / dpr);
      const h = cssH * dpr * Math.max(1, minPixelRatio / dpr);
      const k = Math.min(1, Math.sqrt(maxPixelCount) / Math.sqrt(w * h));
      this.canvasElement.width = Math.round(w * k);
      this.canvasElement.height = Math.round(h * k);
      this.renderScale = this.canvasElement.width / Math.round(cssW);
      made.push({
        renderScale: this.renderScale,
        width: this.canvasElement.width,
        args: [minPixelRatio, maxPixelCount, cssW, cssH],
      });
    }
    setFrame() {}
    dispose() {}
  }
  const shader = "void main(){}";
  return {
    ShaderMount,
    meshGradientFragmentShader: shader,
    dotOrbitFragmentShader: shader,
    godRaysFragmentShader: shader,
    swirlFragmentShader: shader,
    voronoiFragmentShader: shader,
    ditheringFragmentShader: shader,
    getShaderColorFromString: () => [1, 1, 1, 1],
    getShaderNoiseTexture: () => ({ decode: async () => {} }),
    defaultObjectSizing: {
      fit: "contain",
      rotation: 0,
      originX: 0.5,
      originY: 0.5,
      offsetX: 0,
      offsetY: 0,
      worldWidth: 0,
      worldHeight: 0,
    },
    defaultPatternSizing: {
      fit: "none",
      rotation: 0,
      originX: 0.5,
      originY: 0.5,
      offsetX: 0,
      offsetY: 0,
      worldWidth: 0,
      worldHeight: 0,
    },
  };
});

type Layer = { render(a: { timeSeconds: number }): void; dispose(): void };
type Create = (context: Record<string, unknown>) => Promise<Layer>;
const paper = (): Promise<{ createLayer: Create }> =>
  import("../docs/director-bundle/example/graphics/teaser-paper.mjs") as unknown as Promise<{
    createLayer: Create;
  }>;
const { createLayer } = await paper();
const glitter = {
  shader: "dot-orbit",
  colors: "#d5ff70,#f6f8f2,#e6a1ff",
  back: "#0c0e0c",
  backAlpha: 0,
  speed: 1.6,
  scale: 1.4,
  intensity: 0.45,
  seed: 5,
  fadeAt: 0,
};
const layer = () =>
  createLayer({
    canvas: {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect() {},
        drawImage() {},
        globalAlpha: 1,
      }),
    },
    width: 1920,
    height: 1080,
    parameters: glitter,
    libraries: {},
    renderer: null,
  });

afterEach(() => {
  made.length = 0;
  document.body.innerHTML = "";
});

describe("the paper-shader recipe on any screen", () => {
  it("draws at render scale 1 with devicePixelRatio 1 and 2", async () => {
    for (const dpr of [1, 2]) {
      vi.stubGlobal("devicePixelRatio", dpr);
      Object.defineProperty(window, "devicePixelRatio", {
        value: dpr,
        configurable: true,
      });
      const l = await layer();
      l.render({ timeSeconds: 1 });
      l.dispose();
    }
    expect(made).toHaveLength(2);
    expect(made[0]).toEqual(made[1]);
    expect(made[0].renderScale).toBe(1);
    expect(made[0].width).toBe(1920);
  });

  it("removes its host when Paper cannot start", async () => {
    vi.resetModules();
    vi.doMock("@paper-design/shaders", async (original) => ({
      ...(await original<Record<string, unknown>>()),
      ShaderMount: class {
        constructor() {
          throw new Error("no WebGL2");
        }
      },
    }));
    const { createLayer: failing } = await paper();
    await expect(
      failing({
        canvas: { getContext: () => ({}) },
        width: 64,
        height: 36,
        parameters: { ...glitter, shader: "mesh-gradient" },
        libraries: {},
        renderer: null,
      }),
    ).rejects.toThrow("no WebGL2");
    expect(document.querySelectorAll("div[aria-hidden]")).toHaveLength(0);
  });
});

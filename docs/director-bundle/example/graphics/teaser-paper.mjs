// A Paper Shaders background (paper.design, @paper-design/shaders,
// Apache-2.0; LICENSE and NOTICE in docs/credits/libraries/paper-shaders/).
// This file is Genobi integration code: it runs Paper's own ShaderMount and
// fragment shaders, unchanged, on a hidden element of the layer's size, with
// its animation stopped (speed 0), and draws each frame with Paper's
// setFrame() at the layer's time. No loop and no random state, so the same
// time gives the same pixels in any seek order, in preview and Render MP4.
import {
  ShaderMount,
  meshGradientFragmentShader,
  dotOrbitFragmentShader,
  godRaysFragmentShader,
  swirlFragmentShader,
  voronoiFragmentShader,
  ditheringFragmentShader,
  getShaderColorFromString,
  getShaderNoiseTexture,
  defaultObjectSizing,
  defaultPatternSizing,
} from "@paper-design/shaders";

const FIT = { none: 0, contain: 1, cover: 2 };
const color = (hex, alpha = 1) => {
  const [r, g, b] = getShaderColorFromString(hex);
  return [r, g, b, alpha];
};

// Each look: Paper's fragment shader and its uniforms, with `intensity`
// mapped to the one control that matters most for that look.
const LOOKS = {
  // Two-colour ordered dithering over Paper's warp pattern: `colors` gives
  // the ink, `back` the paper; `intensity` sets the dot grid (2 to 8 px).
  dithering: {
    shader: ditheringFragmentShader,
    sizing: defaultObjectSizing,
    uniforms: (p, colors) => ({
      u_colorBack: color(p.back, p.backAlpha),
      u_colorFront: colors[0],
      u_shape: 2,
      u_type: 4,
      u_pxSize: 2 + 6 * p.intensity,
    }),
  },
  "mesh-gradient": {
    shader: meshGradientFragmentShader,
    sizing: defaultObjectSizing,
    uniforms: (p, colors) => ({
      u_colors: colors,
      u_colorsCount: colors.length,
      u_distortion: 0.4 + 0.6 * p.intensity,
      u_swirl: 0.2 + 0.5 * p.intensity,
      u_grainMixer: 0,
      u_grainOverlay: 0.06,
    }),
  },
  "dot-orbit": {
    shader: dotOrbitFragmentShader,
    sizing: defaultPatternSizing,
    noise: true,
    uniforms: (p, colors) => ({
      u_colorBack: color(p.back, p.backAlpha),
      u_colors: colors,
      u_colorsCount: colors.length,
      u_stepsPerColor: 2,
      u_size: 0.12 + 0.6 * p.intensity,
      u_sizeRange: 0.9,
      u_spreading: 0.4,
    }),
  },
  "god-rays": {
    shader: godRaysFragmentShader,
    sizing: defaultObjectSizing,
    noise: true,
    uniforms: (p, colors) => ({
      u_colorBack: color(p.back, p.backAlpha),
      u_colorBloom: colors[0],
      u_colors: colors,
      u_colorsCount: colors.length,
      u_bloom: 0.4,
      u_intensity: p.intensity,
      u_density: 0.3,
      u_spotty: 0.85,
      u_midSize: 0.2,
      u_midIntensity: 0.4,
    }),
  },
  swirl: {
    shader: swirlFragmentShader,
    sizing: defaultObjectSizing,
    uniforms: (p, colors) => ({
      u_colorBack: color(p.back, p.backAlpha),
      u_colors: colors,
      u_colorsCount: colors.length,
      u_bandCount: 4,
      u_twist: 0.2 + 0.6 * p.intensity,
      u_center: 0.2,
      u_proportion: 0.5,
      u_softness: 0.4,
      u_noise: 0.2,
      u_noiseFrequency: 0.4,
    }),
  },
  voronoi: {
    shader: voronoiFragmentShader,
    sizing: defaultPatternSizing,
    noise: true,
    uniforms: (p, colors) => ({
      u_colors: colors,
      u_colorsCount: colors.length,
      u_stepsPerColor: 2,
      u_colorGlow: colors[0],
      u_colorGap: color(p.back, p.backAlpha),
      u_distortion: 0.4,
      u_gap: 0.02 + 0.05 * p.intensity,
      u_glow: p.intensity,
    }),
  },
};

export async function createLayer({ canvas, width, height, parameters }) {
  const p = parameters;
  const look = LOOKS[p.shader];
  if (!look) throw new Error(`Paper shader: no look ${p.shader}`);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const doc = globalThis.document;
  // A hidden host of the layer's size in CSS pixels. With maxPixelCount at
  // exactly its pixels, Paper renders it at a render scale of 1 on any
  // screen: u_pixelRatio is 1, so pattern looks (dot orbit, voronoi) draw
  // the same size on a Retina preview as in a 1× export.
  const host = doc.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: "none",
  });
  const colors = p.colors
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => color(c));
  const sizing = look.sizing;
  const uniforms = {
    u_fit: FIT[sizing.fit] ?? 0,
    u_scale: p.scale,
    u_rotation: sizing.rotation,
    u_originX: sizing.originX,
    u_originY: sizing.originY,
    u_offsetX: sizing.offsetX,
    u_offsetY: sizing.offsetY,
    u_worldWidth: sizing.worldWidth,
    u_worldHeight: sizing.worldHeight,
    ...look.uniforms(p, colors),
  };
  if (look.noise) {
    const image = getShaderNoiseTexture();
    await image.decode();
    uniforms.u_noiseTexture = image;
  }
  let mount;
  doc.body.appendChild(host);
  try {
    mount = new ShaderMount(
      host,
      look.shader,
      uniforms,
      { premultipliedAlpha: true, preserveDrawingBuffer: true },
      0,
      p.seed * 1000,
      1,
      width * height,
    );
  } catch (error) {
    host.remove();
    throw error;
  }
  // The first size arrives through Paper's resize observer; after it the
  // size is fixed, so moving the window to another screen cannot rescale
  // the canvas mid-session.
  for (let i = 0; i < 120 && mount.canvasElement.width !== width; i++)
    await new Promise((r) => globalThis.requestAnimationFrame(r));
  mount.resizeObserver?.disconnect();
  globalThis.visualViewport?.removeEventListener(
    "resize",
    mount.handleVisualViewportChange,
  );
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      mount.setFrame((p.seed + t * p.speed) * 1000);
      const fade =
        p.fadeAt > 0 ? 1 - Math.min(1, Math.max(0, (t - p.fadeAt) / 0.3)) : 1;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.min(1, t / 0.15) * fade;
      ctx.drawImage(mount.canvasElement, 0, 0, width, height);
      ctx.globalAlpha = 1;
    },
    dispose() {
      mount.dispose();
      host.remove();
    },
  };
}

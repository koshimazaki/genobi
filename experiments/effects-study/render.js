/* global document, setTimeout, clearTimeout */
import * as THREE from "three";
import {
  quadVertex,
  screenFragment,
  terrainVertex,
  terrainFragment,
} from "./shaders.js";
export const SOURCE = {
  template: "adaptive-reverb",
  asset: "reverb-ltx",
  url: "/media/director-templates/adaptive-reverb/reverb-ltx.mp4",
  start: 8,
  sha256: "d8c7e053a1a3123f9f5e1b1541903275f8bfd88306f234b120020c9025ccb183",
};
export const FPS = 24,
  FRAMES = 144;
const W = 960,
  H = 540;
export async function createStudy(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = SOURCE.url;
  await new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", resolve, { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error("The bundled source video could not be decoded.")),
      { once: true },
    );
    video.load();
  });
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.setClearColor(0x060c12);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = 1280;
  sourceCanvas.height = 720;
  const sourceCtx = sourceCanvas.getContext("2d");
  const texture = new THREE.CanvasTexture(sourceCanvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const uniforms = {
    source: { value: texture },
    time: { value: 0 },
    amount: { value: 0.65 },
    effect: { value: 0 },
  };
  const screen = new THREE.Scene();
  screen.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: quadVertex,
        fragmentShader: screenFragment,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  );
  const ortho = new THREE.Camera();
  const terrain = new THREE.Scene();
  const group = new THREE.Group();
  terrain.add(group);
  const geometry = new THREE.PlaneGeometry(3.5, 1.97, 180, 100);
  const raster = new THREE.BufferGeometry();
  raster.setAttribute("position", geometry.attributes.position);
  raster.setAttribute("uv", geometry.attributes.uv);
  const indices = [];
  for (let row = 0; row <= 100; row++)
    for (let col = 0; col < 180; col++) {
      const i = row * 181 + col;
      indices.push(i, i + 1);
    }
  raster.setIndex(indices);
  for (const wire of [0, 1]) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        source: uniforms.source,
        amount: uniforms.amount,
        time: uniforms.time,
        wire: { value: wire },
      },
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      side: THREE.DoubleSide,
      polygonOffset: !wire,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    group.add(
      wire
        ? new THREE.LineSegments(raster, material)
        : new THREE.Mesh(geometry, material),
    );
  }
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 20);
  camera.position.set(0, 0.18, 4.1);
  camera.lookAt(0, 0, 0);
  let lastTime = -1;
  async function seek(time) {
    if (Math.abs(lastTime - time) < 0.00001) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        video.removeEventListener("seeked", done);
        reject(new Error("Source frame seek timed out."));
      }, 10000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      video.addEventListener("seeked", done, { once: true });
      video.currentTime = time;
    });
    sourceCtx.drawImage(video, 0, 0, 1280, 720);
    texture.needsUpdate = true;
    lastTime = time;
  }
  function text(value, x, y, size = 11, color = "#a6e3bd", align = "left") {
    ctx.fillStyle = color;
    ctx.font = `${size}px monospace`;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }
  function line(x1, y1, x2, y2, color = "#9ce2bc", alpha = 0.6) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function helmet(t, amount) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#87cda9";
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(112, 37);
    ctx.lineTo(848, 37);
    ctx.quadraticCurveTo(916, 40, 926, 100);
    ctx.lineTo(926, 422);
    ctx.quadraticCurveTo(915, 499, 845, 503);
    ctx.lineTo(115, 503);
    ctx.quadraticCurveTo(42, 499, 34, 423);
    ctx.lineTo(34, 110);
    ctx.quadraticCurveTo(40, 42, 112, 37);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#07120bcc";
    ctx.fillRect(67, 60, 211, 53);
    text("FIELD MONITOR", 79, 82, 17);
    text("OPTICS / CATHEDRAL / 08", 79, 101, 10, "#72a98b");
    text("VISOR 01", 884, 83, 13, "#a6e3bd", "right");
    text("SIGNAL 98.4%", 884, 102, 10, "#72a98b", "right");
    const cx = 480 + Math.sin(t * 0.4) * 15,
      cy = 270 + Math.cos(t * 0.45) * 9;
    for (const d of [-1, 1]) {
      line(cx + d * 12, cy, cx + d * 34, cy);
      line(cx, cy + d * 12, cx, cy + d * 34);
    }
    ctx.strokeStyle = "#e4eed7";
    ctx.strokeRect(cx - 76, cy - 48, 152, 96);
    text("SCAN LOCK", cx, cy - 60, 10, "#d3eedc", "center");
    for (let i = 0; i < 19; i++) {
      const y = 142 + i * 13;
      line(64, y, i % 3 ? 72 : 80, y, "#a6e3bd", 0.42);
      line(896, y, i % 3 ? 888 : 880, y, "#a6e3bd", 0.42);
    }
    const phase = (t * 0.19) % 1;
    line(88, 142 + phase * 247, 103, 142 + phase * 247, "#e4c077", 1);
    text(`F ${String(Math.round(t * 24)).padStart(3, "0")} / 143`, 79, 472, 11);
    text("RGB OFFSET", 480, 470, 9, "#72a98b", "center");
    text(`${(amount * 7.5).toFixed(1)} px`, 480, 486, 11, "#c4edda", "center");
    text("24 FPS  ·  REC", 880, 472, 11, "#a6e3bd", "right");
  }
  function mirror(t) {
    ctx.fillStyle = "rgba(5,16,18,.22)";
    ctx.fillRect(0, 0, W, 60);
    ctx.fillRect(0, H - 75, W, 75);
    text("L I Q U I D   M I R R O R", 30, 36, 14, "#e8e7d6");
    text("06-FOLD / FLOW STUDY", 930, 36, 10, "#c9ded8", "right");
    text("A room, reflected into another rhythm.", 30, 504, 13, "#e8e7d6");
    text(`PHASE ${t.toFixed(2)}`, 930, 504, 11, "#d3e9dd", "right");
  }
  function landscape(t) {
    text("S I G N A L   T E R R A I N", 34, 39, 15, "#e6dcb9");
    text("2.5D / LUMINANCE → HEIGHT", 34, 60, 10, "#718f9d");
    for (let i = 0; i < 11; i++) {
      const x = 240 + i * 48;
      line(x, 489, x, 495, "#8196a1", 0.6);
      if (i % 2 === 0)
        text(String(i * 10).padStart(3, "0"), x, 512, 9, "#70878f", "center");
    }
    text("NO DEPTH ESTIMATION", 34, 503, 9, "#a3b8c0");
    text(
      `FRAME ${Math.round(t * 24)
        .toString()
        .padStart(3, "0")}`,
      925,
      503,
      11,
      "#e6dcb9",
      "right",
    );
  }
  return {
    source: SOURCE,
    async render(frame, mode, amount) {
      const t = frame / FPS;
      await seek(SOURCE.start + t);
      uniforms.time.value = t;
      uniforms.amount.value = amount;
      if (mode === "terrain") {
        group.rotation.set(
          -0.3 + Math.sin(t * 0.55) * 0.08,
          -0.34 + Math.sin(t * 0.35) * 0.15,
          -0.025,
        );
        group.position.y = 0.04;
        renderer.render(terrain, camera);
      } else {
        uniforms.effect.value = mode === "mirror" ? 1 : 0;
        renderer.render(screen, ortho);
      }
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(renderer.domElement, 0, 0);
      if (mode === "helmet") helmet(t, amount);
      else if (mode === "mirror") mirror(t);
      else landscape(t);
    },
    dispose() {
      video.pause();
      video.removeAttribute("src");
      video.load();
      geometry.dispose();
      texture.dispose();
      for (const scene of [screen, terrain])
        scene.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
      renderer.dispose();
    },
  };
}

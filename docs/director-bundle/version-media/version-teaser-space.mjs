// Version media: asset bindings are resolved from the validated bundle before creation.
// Space.js targeting over a still (alienkitty/space.js by Patrick Schroen,
// MIT; docs/credits/libraries/space-js/): its own Tracker boxes lock onto
// points of the picture one after another and its Reticle glides between
// them with a two-line readout. This file is Genobi integration code: it
// builds Space.js's Tracker and Reticle unchanged, stops Space.js's shared
// ticker and drives it from the layer's time in 1/60 s steps, then rasterises
// their DOM (Space.js styles inline) into the layer's canvas through an SVG
// image. A time is reached by replaying from 0, so any seek order gives the
// same pixels, at any device pixel ratio. Words are set with textContent.
import { Reticle } from "@alienkitty/space.js/src/ui/Reticle.js";
import { Tracker } from "@alienkitty/space.js/src/ui/Tracker.js";
import { ticker } from "@alienkitty/space.js/src/tween/Ticker.js";

const STEP = 1000 / 60;
const MONO = "/motion/gallery-build/fonts/mono.woff2";
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dataUrl = async (url) => {
  const blob = await globalThis.fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Space: ${url} is unavailable`);
    return r.blob();
  });
  return new Promise((resolve, reject) => {
    const reader = new globalThis.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};
export const parseTargets = (targets) =>
  targets
    .split("/")
    .map((s) => s.split(",").map((n) => Number(n.trim())))
    .filter((t) => t.length === 4 && t.every(Number.isFinite));

export async function createLayer({ canvas, width, height, parameters }) {
  const p = parameters;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const doc = globalThis.document;
  // Space.js's ticker is shared: no animation frames, only our ticks.
  ticker.stop();
  ticker.setRequestFrame(() => 0);
  const [still, mono] = await Promise.all([dataUrl(p.still), dataUrl(MONO)]);
  // Space.js is drawn at its own pixel sizes, scaled up to the frame.
  const k = (2 * width) / 1280;
  const W = width / k,
    H = height / k;
  const targets = parseTargets(p.targets);
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
  doc.body.appendChild(host);
  let live = null;
  const build = () => {
    host.textContent = "";
    ticker.callbacks.length = 0;
    const root = doc.createElement("div");
    root.setAttribute(
      "style",
      `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform:scale(${k});transform-origin:0 0;font-family:"IBM Plex Mono",monospace;font-size:11px;color:${p.color};--ui-color:${p.color};--ui-number-letter-spacing:0.02em;--ui-secondary-font-size:9px;--ui-secondary-letter-spacing:0.08em`,
    );
    const img = doc.createElement("img");
    img.setAttribute("src", still);
    img.setAttribute(
      "style",
      `position:absolute;left:0;top:0;width:${W}px;height:${H}px;object-fit:cover`,
    );
    root.appendChild(img);
    const shade = doc.createElement("div");
    shade.setAttribute(
      "style",
      `position:absolute;inset:0;background:rgba(12,14,12,${p.dim})`,
    );
    root.appendChild(shade);
    host.appendChild(root);
    const trackers = targets.map(([x, y, w, h], i) => {
      const t = new Tracker();
      t.css({
        width: w * W,
        height: h * H,
        marginLeft: (-w * W) / 2,
        marginTop: (-h * H) / 2,
      });
      t.position.set(x * W, y * H);
      t.target.copy(t.position);
      t.setData(String(i + 1).padStart(2, "0"));
      root.appendChild(t.element);
      return t;
    });
    const reticle = new Reticle();
    reticle.lerpSpeed = 0.18;
    reticle.position.set(W / 2, H / 2);
    reticle.target.copy(reticle.position);
    reticle.setData({ primary: " ", secondary: " " });
    reticle.info.primary.element.textContent = p.label;
    reticle.info.secondary.element.textContent = p.credit;
    reticle.info.secondary.element.style.whiteSpace = "nowrap";
    root.appendChild(reticle.element);
    // What happens when, in ms of the layer's time.
    const events = [[100, () => reticle.animateIn()]];
    trackers.forEach((t, i) => {
      const at = 150 + i * p.interval * 1000;
      events.push([at, () => t.animateIn()]);
      events.push([at + 180, () => t.lock()]);
      events.push([
        at,
        () => reticle.target.set(targets[i][0] * W, targets[i][1] * H),
      ]);
    });
    events.sort((a, b) => a[0] - b[0]);
    ticker.last = 0;
    return { trackers, reticle, events, ms: -1, next: 0, root };
  };
  const step = (s, ms) => {
    while (s.next < s.events.length && s.events[s.next][0] <= ms)
      s.events[s.next++][1]();
    ticker.onTick(ms);
    s.reticle.update();
    for (const t of s.trackers) t.update();
    s.ms = ms;
  };
  const font = `@font-face{font-family:"IBM Plex Mono";src:url(${mono})}`;
  return {
    output: canvas,
    async render({ timeSeconds }) {
      const ms = Math.max(0, timeSeconds) * 1000;
      if (!live || ms < live.ms) {
        live = build();
        step(live, 0);
      }
      for (let at = live.ms + STEP; at <= ms; at += STEP) step(live, at);
      const markup = new globalThis.XMLSerializer().serializeToString(host);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${font}</style>${markup.replace(/left:\s*-20000px;?/, "left:0;")}</div></foreignObject></svg>`;
      const image = new globalThis.Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const fade =
        p.fadeAt > 0 ? 1 - clamp((timeSeconds - p.fadeAt) / 0.3, 0, 1) : 1;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = fade;
      ctx.drawImage(image, 0, 0, width, height);
      ctx.globalAlpha = 1;
    },
    dispose() {
      live = null;
      host.remove();
    },
  };
}

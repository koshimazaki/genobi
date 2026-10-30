// Genobi's DOM stage for Director recipes (docs/genobi-teaser.md#the-stage).
// A recipe opens a private, same-origin frame, loads this module into it
// (window.GenobiStage) beside an upstream transition that runs unchanged,
// stops everything on the composition's clock and rasterises the frame into
// the layer's canvas through an SVG image, as the end card does. Genobi
// integration code; it contains no transition. Pure in time: CSS animations and transitions are
// paused and set to the layer's time, a scrubbable effect is sought, and the
// same parameters give the same pixels in any seek order.
//
// The raster is an SVG <foreignObject> image, which loads nothing and plays
// nothing, so what the frame shows is written into it: every animated value
// is baked into a rule for its element (pseudo-elements included), canvases
// become images of their pixels, images and fonts become data URLs.
/* global document, fetch, FileReader, XMLSerializer, window */

const cache = new Map();
/** A same-origin file as a data URL (or text), fetched once per page. */
export function load(url, as = "data") {
  const key = `${as}:${url}`;
  if (!cache.has(key))
    cache.set(
      key,
      fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`Stage: ${url} is unavailable`);
        if (as === "text") return r.text();
        const blob = await r.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }),
    );
  return cache.get(key);
}

/** `@font-face` rules for bundled faces, by URL (the frame) or inlined (the raster). */
export async function fontFaces(fonts, inline) {
  const rules = await Promise.all(
    fonts.map(async ({ family, url, weight = "400 700" }) => {
      const src = inline ? await load(url) : url;
      return `@font-face{font-family:"${family}";font-weight:${weight};src:url(${src})}`;
    }),
  );
  return rules.join("\n");
}

/** Bundled faces the recipes may name. */
export const FONTS = [
  { family: "IBM Plex Mono", url: "/motion/gallery-build/fonts/mono.woff2" },
  {
    family: "Instrument Sans Variable",
    url: "/motion/gallery-build/fonts/instrument.woff2",
  },
  { family: "Nokia Cellphone FC", url: "/motion/fonts/nokia-fc/nokiafc22.woff2" },
];

/**
 * Pauses every CSS animation and transition in the frame and sets it to
 * `ms` after its own start: `startOf(animation)` gives that start in ms on
 * the layer's clock (0 for animations running from the first frame).
 */
export function seekAnimations(ms, startOf = () => 0) {
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = Math.max(0, ms - startOf(a));
  }
}

const kebab = (p) => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const SKIP = new Set(["offset", "easing", "composite", "computedOffset"]);

/** Rules that hold every animated value where the frame has it now. */
function bake(doc) {
  const win = doc.defaultView;
  const rules = [];
  let k = 0;
  for (const a of doc.getAnimations()) {
    const effect = a.effect;
    const el = effect?.target;
    if (!el) continue;
    if (!el.dataset.stageK) el.dataset.stageK = String(k++);
    const pseudo = effect.pseudoElement ?? "";
    const props = new Set(
      a.transitionProperty
        ? [a.transitionProperty]
        : effect.getKeyframes().flatMap((f) => Object.keys(f)),
    );
    const cs = win.getComputedStyle(el, pseudo || null);
    const decl = [...props]
      .filter((p) => !SKIP.has(p))
      .map((p) => {
        const name = p.startsWith("--") ? p : kebab(p);
        let value = cs.getPropertyValue(name);
        // A settled blur is no filter: a zero blur still makes the raster
        // draw a box behind the element.
        if (name === "filter" && /^blur\(0(px)?\)$/.test(value)) value = "none";
        return `${name}:${value} !important`;
      })
      .join(";");
    if (decl) rules.push(`[data-stage-k="${el.dataset.stageK}"]${pseudo}{${decl}}`);
  }
  return rules.join("\n");
}

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The frame as it is now, as an SVG image's markup: `css` is the frame's own
 * styles (fonts are inlined here), the animated values are baked, canvases
 * are swapped for images of their pixels and images are inlined.
 */
export async function snapshot(css, width, height) {
  const doc = document;
  const baked = bake(doc);
  const body = doc.body.cloneNode(true);
  const live = [...doc.body.querySelectorAll("canvas")];
  [...body.querySelectorAll("canvas")].forEach((copy, i) => {
    const source = live[i];
    const img = doc.createElement("img");
    for (const { name, value } of copy.attributes)
      img.setAttribute(name, value);
    img.style.width = `${source.offsetWidth}px`;
    img.style.height = `${source.offsetHeight}px`;
    img.setAttribute("src", source.toDataURL("image/png"));
    copy.replaceWith(img);
  });
  for (const img of body.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (src && !src.startsWith("data:")) img.setAttribute("src", await load(src));
  }
  for (const s of body.querySelectorAll("script")) s.remove();
  const faces = await fontFaces(FONTS, true);
  const style = escapeXml(`${faces}
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}
${css}
*,*::before,*::after{animation:none !important;transition:none !important}
${baked}`);
  const markup = new XMLSerializer().serializeToString(body);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><html xmlns="http://www.w3.org/1999/xhtml" data-theme="light"><head><style>${style}</style></head>${markup}</html></foreignObject></svg>`;
}

window.GenobiStage = { load, fontFaces, FONTS, seekAnimations, snapshot };
window.dispatchEvent(new window.Event("genobi-stage-ready"));

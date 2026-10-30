// The Dimensions mix's end card, as layers: an original card (a still, an
// eyebrow, a title, a subtitle and two credit lines) built by the Signal
// theme's construction effect, Jakub Antalik's "UI generation /
// skeleton-texts" from Transitions.dev. This file is Genobi integration
// code; it does not contain the effect. It loads the effect unchanged from
// /motion/construction/ (under its own licence and credit, see
// public/motion/construction/LICENSE.txt and LICENCES.md) into a private
// 960 x 540 frame, runs its own generate() on the injectable clock, and
// rasterises that frame into the layer's canvas through an SVG image. This
// is how the original capture was made, a page screenshot per frame, so the
// card can now be re-rendered with other words and otherwise the same build.
//
// Pure in time: each instance has its own frame, clock and effect module, so
// a time is reached by building once and advancing the clock; an earlier
// time rebuilds. The effect's seeded hashes depend on how many builds its
// module has made, which is always one here. The frame ignores the viewer's
// reduced-motion and colour-scheme settings, so preview and export agree.
// Everything the frame loads is same-origin and by URL, so the hosted
// Content-Security-Policy (script-src and font-src 'self') holds.
/* global AbortController, document, fetch, FileReader, Image, XMLSerializer, setTimeout, clearTimeout */
const W = 960,
  H = 540;
// The room beside the still for one line of title: the card's 676 px less
// its border, padding, still and gap.
const TEXT_WIDTH = 676 - 2 - 2 * 18 - 221 - 28;
const ROOT = "/motion/construction/";
const FILES = {
  css: `${ROOT}ui-generation.css`,
  bridge: `${ROOT}bridge.js`,
  mono: "/motion/gallery-build/fonts/mono.woff2",
  sans: "/motion/gallery-build/fonts/instrument.woff2",
  pixel: "/motion/fonts/nokia-fc/nokiafc22.woff2",
  still: "/media/director-templates/dimensions-mix/end-card.jpg",
};
// The capture page's own styles and the Signal colours, set through the
// effect's CSS variables. `data-theme="light"` keeps the effect's dark-scheme
// rules out, and the last rule keeps it drawing when motion is reduced.
const style = (css, { mono, sans, pixel }, p) =>
  `${css}
@font-face{font-family:"IBM Plex Mono";src:url(${mono})}
@font-face{font-family:"Instrument Sans Variable";font-weight:400 700;src:url(${sans})}
@font-face{font-family:"Nokia Cellphone FC";font-weight:400 700;src:url(${pixel})}
:root{--gen-line:#98aa84;--gen-strong:#d5ff70;--gen-ink:rgba(234,242,223,.22);--gen-surface:#151b11;--gen-text:#eaf2df;--gen-muted:#98aa84;--gen-font:"IBM Plex Mono",monospace}
html,body{margin:0;width:${W}px;height:${H}px;background:#0c0e0c;overflow:hidden}
#card{position:absolute;left:142px;top:112px;width:676px;height:260px;display:flex;gap:28px;align-items:center;font-family:"IBM Plex Mono",monospace;color:#eaf2df;border:1px solid #2a3322;border-radius:10px;padding:18px;box-sizing:border-box;background:#151b11}
#card img{width:221px;height:221px;border-radius:6px;object-fit:cover}
.k{font-size:13px;letter-spacing:.18em;color:#98aa84}
.t{font-family:${p.font};font-size:48px;line-height:1;white-space:nowrap;color:${p.color};margin:16px 0 4px}
.s{font-size:14px;letter-spacing:.12em;color:${p.accent}}
.c{font-size:11px;letter-spacing:.08em;color:#98aa84;margin-top:14px;line-height:1.5}
@media (prefers-reduced-motion:reduce){.t-gen{display:block}}`;
const BODY = `<div id="card"><img alt=""><div><div class="k"></div><div class="t"></div><div class="s"></div><div class="c"><span></span><br><span></span></div></div></div>`;

const cache = new Map();
const load = (url, as) => {
  const key = `${as}:${url}`;
  if (!cache.has(key))
    cache.set(
      key,
      fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`End card: ${url} is unavailable`);
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
};

// A lone UTF-16 surrogate passes the schema's pattern but cannot be
// encoded into the SVG's data URL; it is drawn as U+FFFD instead.
const LONE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const wellFormed = (parameters) =>
  Object.fromEntries(
    Object.entries(parameters).map(([k, v]) => [
      k,
      typeof v === "string" ? v.replace(LONE, "\uFFFD") : v,
    ]),
  );

// `signal` ends a build the layer no longer wants: every wait gives up and
// the frame leaves the page, so a disposed layer leaves no frame behind.
async function openFrame(p, files, signal) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${W}px`,
    height: `${H}px`,
    border: "0",
    pointerEvents: "none",
  });
  frame.srcdoc = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${style(files.css, FILES, p)}</style></head><body>${BODY}</body></html>`;
  const loaded = new Promise((resolve) =>
    frame.addEventListener("load", resolve, { once: true }),
  );
  const stopped = new Promise((_, reject) => {
    const stop = () => reject(new Error("End card: disposed"));
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });
  stopped.catch(() => {});
  const until = (promise) => Promise.race([promise, stopped]);
  document.body.appendChild(frame);
  try {
    await until(loaded);
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    // The frame answers "no" to reduced motion and a dark scheme, whatever
    // the viewer prefers; the effect asks when it starts.
    const real = win.matchMedia.bind(win);
    const no = (media) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
    win.matchMedia = (q) =>
      /prefers-(reduced-motion|color-scheme)/.test(q) ? no(q) : real(q);
    // The effect's own bridge hands over its clock; its generate() is on
    // window.UIGeneration once ui-generation.js has run.
    const { installClock } = await until(
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("End card: the effect did not load")),
          15000,
        );
        win.addEventListener(
          "genobi-construction-ready",
          (e) => {
            clearTimeout(timer);
            resolve(e.detail);
          },
          { once: true },
        );
        const script = doc.createElement("script");
        script.type = "module";
        script.src = FILES.bridge;
        script.onerror = () => {
          clearTimeout(timer);
          reject(new Error("End card: the effect did not load"));
        };
        doc.head.appendChild(script);
      }),
    );
    const card = doc.getElementById("card");
    const [img] = card.getElementsByTagName("img");
    img.src = files.still;
    await until(img.decode());
    card.setAttribute("aria-label", p.title);
    card.querySelector(".k").textContent = p.eyebrow;
    card.querySelector(".s").textContent = p.subtitle;
    const [c1, c2] = card.querySelectorAll(".c span");
    c1.textContent = p.credit1;
    c2.textContent = p.credit2;
    // Some headline faces draw only lower-case letters (their capitals fall
    // through to the next family); the title is then set in lower case so
    // that face draws it, as the capture did.
    const t = card.querySelector(".t");
    const face = (family) => `48px ${family}`;
    await until(
      doc.fonts.load(face(p.font), `${p.title}${p.title.toLowerCase()}`),
    );
    await until(doc.fonts.ready);
    if (signal.aborted) throw new Error("End card: disposed");
    const ctx = doc.createElement("canvas").getContext("2d");
    const rest = p.font.split(",").slice(1).join(",").trim() || "sans-serif";
    const measure = (s, family) => {
      ctx.font = face(family);
      return ctx.measureText(s).width;
    };
    const letters = p.title.replace(/[^\p{L}]/gu, "");
    const upper = letters.toUpperCase(),
      lower = letters.toLowerCase();
    const lowerOnly =
      upper !== lower &&
      measure(upper, p.font) === measure(upper, rest) &&
      measure(lower, p.font) !== measure(lower, rest);
    t.textContent = lowerOnly ? p.title.toLowerCase() : p.title;
    // The title is 48 px, on the pixel face's 8 px grid (the capture's was 57);
    // a longer one is set smaller so it stays on the card.
    const wide = measure(t.textContent, p.font);
    if (wide > TEXT_WIDTH)
      t.style.fontSize = `${Math.floor((48 * TEXT_WIDTH) / wide)}px`;
    const clock = installClock();
    win.UIGeneration.generate(card, {
      mode: "skeleton-texts",
      duration: p.duration * 1000,
      steps: p.steps.split(" / ").filter(Boolean),
      done: p.done,
      title: p.title,
    });
    clock.advance(0);
    return { frame, clock, doc, ms: 0 };
  } catch (error) {
    frame.remove();
    throw error;
  }
}

export async function createLayer({ canvas, width, height, ...context }) {
  const parameters = wellFormed(context.parameters);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const [css, mono, sans, pixel, still] = await Promise.all([
    load(FILES.css, "text"),
    load(FILES.mono, "data"),
    load(FILES.sans, "data"),
    load(FILES.pixel, "data"),
    load(FILES.still, "data"),
  ]);
  // An SVG image loads nothing, so its copy of the styles carries the fonts.
  const raster = escapeXml(style(css, { mono, sans, pixel }, parameters));
  const serializer = new XMLSerializer();
  let live = null;
  let drawn = "";
  // The host may dispose while a render waits on a build; the abort removes
  // that pending frame and the render returns without drawing.
  const ended = new AbortController();
  const close = () => {
    live?.frame.remove();
    live = null;
  };
  return {
    output: canvas,
    async render({ timeSeconds }) {
      if (ended.signal.aborted) return;
      const ms = Math.max(0, timeSeconds) * 1000;
      if (!live || ms < live.ms) {
        close();
        try {
          live = await openFrame(parameters, { css, still }, ended.signal);
        } catch (error) {
          if (ended.signal.aborted) return;
          throw error;
        }
        drawn = "";
      }
      if (ms > live.ms) {
        live.clock.advance(ms - live.ms);
        live.ms = ms;
      }
      // The frame's body as it is now; its script stays in the head.
      const body = serializer.serializeToString(live.doc.body);
      if (body === drawn) return;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><foreignObject x="0" y="0" width="${W}" height="${H}"><html xmlns="http://www.w3.org/1999/xhtml" data-theme="light"><head><style>${raster}</style></head>${body}</html></foreignObject></svg>`;
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      if (ended.signal.aborted) return;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      drawn = body;
    },
    dispose() {
      ended.abort();
      close();
    },
  };
}

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

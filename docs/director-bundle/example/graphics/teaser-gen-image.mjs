// A picture that is generated on screen: Jakub Antalik's "UI generation"
// image variant from Transitions.dev (a dotted frame, a tone sketch, a
// halftone of the picture's own pixels, colour dots, then the picture) on a
// still of a bundled clip, so the cut can hand over to the clip itself on
// its first frame. This file is Genobi
// integration code; it does not contain the effect. It loads the effect
// unchanged from /motion/text-generation/ (its own licence and credit:
// public/motion/text-generation/LICENSE.txt, LICENCES.md) into a private
// frame with Genobi's stage (/motion/stage/stage.js), builds the picture with
// the effect's own scrubbable timeline() and seeks it to the layer's time,
// then rasterises the frame into the layer's canvas, as the end card does.
//
// Pure in time: the effect's timeline seeks backwards as well as forwards,
// so the same parameters give the same pixels in any seek order. The still
// is a same-origin path the schema holds to /media/.
/* global AbortController, document, fetch, Image, setTimeout, clearTimeout */
const STAGE = "/motion/stage/stage.js";
const EFFECT = "/motion/text-generation/text-image-generation.js";
const EFFECT_CSS = "/motion/text-generation/text-image-generation.css";

const LONE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const clean = (p) =>
  Object.fromEntries(
    Object.entries(p).map(([k, v]) => [
      k,
      typeof v === "string" ? v.replace(LONE, "�") : v,
    ]),
  );
const FACES = `@font-face{font-family:"IBM Plex Mono";src:url(/motion/gallery-build/fonts/mono.woff2)}
@font-face{font-family:"Instrument Sans Variable";font-weight:400 700;src:url(/motion/gallery-build/fonts/instrument.woff2)}
@font-face{font-family:"Nokia Cellphone FC";font-weight:400 700;src:url(/motion/fonts/nokia-fc/nokiafc22.woff2)}`;

// Signal colours through the effect's own variables. The picture sits
// `inset` in from the frame's edges, on Signal black.
const style = (effectCss, p, w, h) => `${effectCss}
:root{--tig-line:#98aa84;--tig-strong:${p.accent};--tig-ink:rgba(234,242,223,.5);--tig-surface:#151b11;--tig-text:#eaf2df;--tig-muted:#98aa84;--tig-font:"IBM Plex Mono",monospace;--tig-dot:${(2.1 * w) / 1280}px}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
#root{position:absolute;inset:0;background:${p.matte}}
#i{position:absolute;left:${p.inset * 100}%;top:${p.inset * 100}%;width:${100 - 200 * p.inset}%;height:${100 - 200 * p.inset}%;object-fit:cover;display:block}`;

async function openFrame(p, effectCss, w, h, signal) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${w}px`,
    height: `${h}px`,
    border: "0",
    pointerEvents: "none",
  });
  const css = style(effectCss, p, w, h);
  frame.srcdoc = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${FACES}\n${css}</style></head><body><div id="root"><img id="i" alt=""></div></body></html>`;
  const stopped = new Promise((_, reject) => {
    const stop = () => reject(new Error("Picture: disposed"));
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });
  stopped.catch(() => {});
  const until = (promise) => Promise.race([promise, stopped]);
  const loaded = new Promise((r) =>
    frame.addEventListener("load", r, { once: true }),
  );
  document.body.appendChild(frame);
  try {
    await until(loaded);
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    const real = win.matchMedia.bind(win);
    win.matchMedia = (q) =>
      /prefers-(reduced-motion|color-scheme)/.test(q)
        ? {
            matches: false,
            media: q,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
          }
        : real(q);
    for (const src of [STAGE, EFFECT])
      await until(
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Picture: ${src} did not load`)),
            15000,
          );
          const script = doc.createElement("script");
          script.type = "module";
          script.src = src;
          script.onload = () => (clearTimeout(timer), resolve());
          script.onerror = () => (
            clearTimeout(timer),
            reject(new Error(`Picture: ${src} did not load`))
          );
          doc.head.appendChild(script);
        }),
      );
    const img = doc.getElementById("i");
    img.src = p.still;
    await until(img.decode());
    await until(doc.fonts.ready);
    const tl = win.TextImageGeneration.timeline(img, {
      variant: "image",
      mode: p.mode,
      duration: p.duration * 1000,
      steps: p.steps.split(" / ").filter(Boolean),
      done: p.done,
      dotScale: w / 1280,
      // Inside #root, so the drawing fades with the picture.
      parent: doc.getElementById("root"),
    });
    return { frame, win, doc, tl, css };
  } catch (error) {
    frame.remove();
    throw error;
  }
}

export async function createLayer({ canvas, width, height, ...context }) {
  const p = clean(context.parameters);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const effectCss = await fetch(EFFECT_CSS).then((r) => {
    if (!r.ok) throw new Error("Picture: the effect's styles are unavailable");
    return r.text();
  });
  const ended = new AbortController();
  let live = null;
  let drawn = "";
  return {
    output: canvas,
    async render({ timeSeconds }) {
      if (ended.signal.aborted) return;
      if (!live) {
        try {
          live = await openFrame(p, effectCss, width, height, ended.signal);
        } catch (error) {
          if (ended.signal.aborted) return;
          throw error;
        }
      }
      const t = Math.max(0, timeSeconds);
      live.tl.seek(t * 1000);
      live.win.GenobiStage.seekAnimations(t * 1000);
      const fade =
        p.fadeAt > 0 ? Math.min(1, Math.max(0, (t - p.fadeAt) / 0.35)) : 0;
      live.doc.getElementById("root").style.opacity = String(1 - fade);
      const svg = await live.win.GenobiStage.snapshot(live.css, width, height);
      if (ended.signal.aborted || svg === drawn) return;
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      if (ended.signal.aborted) return;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      drawn = svg;
    },
    dispose() {
      ended.abort();
      live?.frame.remove();
      live = null;
    },
  };
}

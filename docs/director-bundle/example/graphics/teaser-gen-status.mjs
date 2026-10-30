// A generation status, built from four free Transitions.dev transitions by
// Jakub Antalik, each used unchanged: the matrix dot loader and shimmer text
// while it works, then the success check and the texts reveal when it is
// done. This file is Genobi integration code; it does not contain the
// transitions. It loads their CSS (and the loader's own dot builder)
// unchanged from /motion/transitions-dev/ (their licence:
// public/motion/transitions-dev/LICENSE.txt, LICENCES.md) into a private
// frame with Genobi's stage (/motion/stage/stage.js), which pauses every
// CSS animation and transition and sets it to the layer's time, then
// rasterises the frame into the layer's canvas, as the end card does.
//
// Pure in time: the loop animations run from the layer's start and the done
// transitions from `doneAt`; going back before `doneAt` resets them without
// a transition, so any seek order gives the same pixels. Words are set with
// textContent, never parsed as markup.
/* global AbortController, document, fetch, Image, setTimeout, clearTimeout */
const STAGE = "/motion/stage/stage.js";
const TD = "/motion/transitions-dev/";
const SHEETS = [
  "matrix-loader",
  "shimmer-text",
  "success-check",
  "texts-reveal",
];
const LOADER = `${TD}matrix-loader.js`;

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

// A Signal pill at (x, y): the transitions' own variables carry the colours.
const style = (sheets, p, w, h) => {
  const u = (p.scale * w) / 1280;
  return `${sheets}
:root{--matrix-base:#2a3322;--matrix-active:${p.color};--shimmer-base:#98aa84;--shimmer-highlight:#f6f8f2;--stagger-distance:${12 * u}px}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
#root{position:absolute;left:${p.x * 100}%;top:${p.y * 100}%;transform:translate(-50%,-50%)}
.pill{display:flex;align-items:center;gap:${12 * u}px;height:${40 * u}px;padding:0 ${18 * u}px;border:1px solid #2a3322;border-radius:${20 * u}px;background:rgba(21,27,17,.92);font-family:"IBM Plex Mono",monospace;font-size:${14 * u}px;letter-spacing:.06em;white-space:nowrap;box-shadow:0 ${8 * u}px ${30 * u}px rgba(0,0,0,.45)}
.t-matrix{transform:scale(${1.6 * u});transform-origin:center;margin:0 ${4 * u}px}
#done{position:absolute;inset:0;justify-content:flex-start;opacity:0}
#done.on{opacity:1}
#work.off{opacity:0}
.t-success-check svg{width:${22 * u}px;height:${22 * u}px}
.t-success-check svg path{stroke:${p.color};stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;fill:none}
.t-stagger{display:flex;flex-direction:column;line-height:1.15}
.t-stagger-line--1{color:#f6f8f2}`;
};

async function openFrame(p, sheets, w, h, signal) {
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
  const css = style(sheets, p, w, h);
  frame.srcdoc = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${FACES}\n${css}</style></head><body><div id="root"><div class="pill" id="work"><div class="t-matrix"></div><span class="t-shimmer"></span></div><div class="pill" id="done"><span class="t-success-check" data-state="out"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="t-stagger"><span class="t-stagger-line t-stagger-line--1"></span></span></div></div></body></html>`;
  const stopped = new Promise((_, reject) => {
    const stop = () => reject(new Error("Status: disposed"));
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
    // The loader's variant is set before its dot builder runs.
    doc.querySelector(".t-matrix").dataset.variant = p.variant;
    const shimmer = doc.querySelector(".t-shimmer");
    shimmer.textContent = p.label;
    shimmer.dataset.text = p.label;
    doc.querySelector(".t-stagger-line--1").textContent = p.done;
    for (const [src, module] of [
      [STAGE, true],
      [LOADER, false],
    ])
      await until(
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Status: ${src} did not load`)),
            15000,
          );
          const script = doc.createElement("script");
          if (module) script.type = "module";
          script.src = src;
          script.onload = () => (clearTimeout(timer), resolve());
          script.onerror = () => (
            clearTimeout(timer),
            reject(new Error(`Status: ${src} did not load`))
          );
          doc.head.appendChild(script);
        }),
      );
    await until(doc.fonts.ready);
    return { frame, win, doc, css, done: false };
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
  const sheets = (
    await Promise.all(
      SHEETS.map((name) =>
        fetch(`${TD}${name}.css`).then((r) => {
          if (!r.ok) throw new Error(`Status: ${name} is unavailable`);
          return r.text();
        }),
      ),
    )
  ).join("\n");
  const ended = new AbortController();
  let live = null;
  let drawn = "";
  return {
    output: canvas,
    async render({ timeSeconds }) {
      if (ended.signal.aborted) return;
      if (!live) {
        try {
          live = await openFrame(p, sheets, width, height, ended.signal);
        } catch (error) {
          if (ended.signal.aborted) return;
          throw error;
        }
      }
      const t = Math.max(0, timeSeconds);
      const ms = t * 1000;
      const { doc, win } = live;
      const done = p.doneAt > 0 && t >= p.doneAt;
      const group = doc.getElementById("done");
      const check = doc.querySelector(".t-success-check");
      const reveal = doc.querySelector(".t-stagger");
      if (done !== live.done) {
        // Back before doneAt: the resting state, with no transition.
        check.dataset.state = done ? "in" : "out";
        reveal.classList.toggle("is-shown", done);
        group.classList.toggle("on", done);
        doc.getElementById("work").classList.toggle("off", done);
        void win.getComputedStyle(reveal.firstChild).opacity;
        if (!done)
          for (const a of doc.getAnimations())
            if (group.contains(a.effect?.target)) a.cancel();
        live.done = done;
      }
      win.GenobiStage.seekAnimations(ms, (a) =>
        group.contains(a.effect?.target) ? p.doneAt * 1000 : 0,
      );
      const fade =
        p.fadeAt > 0 ? Math.min(1, Math.max(0, (t - p.fadeAt) / 0.3)) : 0;
      const enter = Math.min(1, t / 0.25);
      const root = doc.getElementById("root");
      root.style.opacity = String(enter * (1 - fade));
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

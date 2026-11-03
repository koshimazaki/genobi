/* global document, window, performance, requestAnimationFrame, cancelAnimationFrame, console, Blob, URL, setTimeout */
import { createStudy, FPS, FRAMES, SOURCE } from "./render.js";
import { readConfiguration } from "./configuration.js";
const $ = (s) => document.querySelector(s);
const descriptions = {
  helmet: {
    title: "FIELD MONITOR",
    name: "Field monitor / 01",
    description:
      "A restrained visor display over existing footage. Scanning light, curved optics and controlled chromatic separation move on one clock.",
    technique: "VIDEO + ORIGINAL SHADER + HUD",
    ingredients: [
      "Source video",
      "Lens & RGB split",
      "Scanning light",
      "Vector readouts",
    ],
  },
  mirror: {
    title: "LIQUID MIRROR",
    name: "Liquid mirror / 02",
    description:
      "The cathedral folds into a moving reflection. Analytic waves and six mirrored sectors create a fluid impression; this is a deterministic distortion, not a fluid simulation.",
    technique: "VIDEO + ORIGINAL REFLECTION SHADER",
    ingredients: [
      "Source video",
      "Six-fold reflection",
      "Flow distortion",
      "Glass highlights",
    ],
  },
  terrain: {
    title: "SIGNAL TERRAIN",
    name: "Signal terrain / 03",
    description:
      "The video's brightness lifts a wire surface. A slow orbit exposes the relief. This is 2.5D luminance displacement, with no depth estimation or reconstructed scene.",
    technique: "2.5D · LUMINANCE, NO DEPTH MODEL",
    ingredients: [
      "Source video",
      "Luminance height field",
      "Wire surface + orbit",
      "Alien.js Fresnel rim",
    ],
  },
};
const state = {
  mode: "helmet",
  frame: 0,
  intensity: 0.65,
  playing: false,
  ready: false,
};
let engine,
  serial = Promise.resolve(),
  clockStart = 0,
  frameStart = 0,
  playbackGeneration = 0,
  scheduledFrame = 0;
function publish() {
  const d = descriptions[state.mode];
  $("#mode-title").textContent = d.title;
  $("#recipe-name").textContent = d.name;
  $("#description").textContent = d.description;
  $("#technique").textContent = d.technique;
  $("#ingredients").replaceChildren(
    ...d.ingredients.map((name, i) => {
      const li = document.createElement("li"),
        number = document.createElement("span");
      number.textContent = String(i + 1).padStart(2, "0");
      li.append(number, document.createTextNode(name));
      return li;
    }),
  );
  for (const button of document.querySelectorAll("[data-mode]"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mode === state.mode),
    );
  $("#frame").value = state.frame;
  $("#intensity").value = state.intensity;
  $("#amount").textContent = `${Math.round(state.intensity * 100)}%`;
  $("#time").textContent =
    `${(state.frame / FPS).toFixed(2).padStart(5, "0")} / 06.00 s`;
  $("#frame-status").textContent =
    `FRAME ${String(state.frame).padStart(3, "0")} · 24 FPS`;
  $("#play").innerHTML = state.playing
    ? "Ⅱ <span>Pause</span>"
    : "▶ <span>Play</span>";
  $("#play").setAttribute(
    "aria-label",
    state.playing ? "Pause study" : "Play study",
  );
}
function pause() {
  playbackGeneration++;
  cancelAnimationFrame(scheduledFrame);
  scheduledFrame = 0;
  state.playing = false;
  publish();
}
function fail(error) {
  pause();
  $("#loading").hidden = false;
  $("#loading").textContent = error.message;
  $("#loading").setAttribute("role", "alert");
  console.error(error);
}
function render(frame) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= FRAMES)
    return Promise.reject(new Error("Choose a frame from 0 to 143."));
  const mode = state.mode,
    amount = state.intensity;
  state.frame = frame;
  publish();
  serial = serial.then(() => engine.render(frame, mode, amount));
  return serial;
}
async function tick(now, generation) {
  if (!state.playing || generation !== playbackGeneration) return;
  scheduledFrame = 0;
  const frame =
    (frameStart + Math.floor((Math.max(0, now - clockStart) * FPS) / 1000)) %
    FRAMES;
  try {
    if (frame !== state.frame) await render(frame);
    if (state.playing && generation === playbackGeneration)
      scheduledFrame = requestAnimationFrame(function studyFrame(time) {
        void tick(time, generation);
      });
  } catch (e) {
    fail(e);
  }
}
function configuration() {
  return {
    schema: "genobi.effects-study.v1",
    mode: state.mode,
    intensity: state.intensity,
    frame: state.frame,
    fps: FPS,
    frames: FRAMES,
    width: 960,
    height: 540,
    source: { ...SOURCE },
  };
}
async function setStudy(patch) {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    Object.keys(patch).some(
      (key) => !["mode", "intensity", "frame"].includes(key),
    )
  )
    throw new Error("Use mode, intensity and frame controls.");
  if (
    patch.mode !== undefined &&
    (typeof patch.mode !== "string" || !Object.hasOwn(descriptions, patch.mode))
  )
    throw new Error("Unknown study mode.");
  if (
    patch.intensity !== undefined &&
    (!Number.isFinite(patch.intensity) ||
      patch.intensity < 0 ||
      patch.intensity > 1)
  )
    throw new Error("Intensity must be between 0 and 1.");
  if (
    patch.frame !== undefined &&
    (!Number.isInteger(patch.frame) || patch.frame < 0 || patch.frame >= FRAMES)
  )
    throw new Error("Choose a frame from 0 to 143.");
  pause();
  if (patch.mode !== undefined) state.mode = patch.mode;
  if (patch.intensity !== undefined) state.intensity = patch.intensity;
  await render(patch.frame ?? state.frame);
  return configuration();
}
try {
  engine = await createStudy($("#output"));
  await document.fonts.ready;
  await render(0);
  state.ready = true;
  $("#loading").hidden = true;
  for (const id of ["play", "frame", "intensity", "save", "open"])
    $(`#${id}`).disabled = false;
  window.effectsStudy = {
    render: async (frame) => {
      pause();
      await render(frame);
      return configuration();
    },
    set: setStudy,
    get: () => ({
      ...configuration(),
      ready: state.ready,
      playing: state.playing,
    }),
    canvas: $("#output"),
  };
  window.render = window.effectsStudy.render;
  for (const button of document.querySelectorAll("[data-mode]"))
    button.addEventListener("click", () =>
      setStudy({ mode: button.dataset.mode }).catch(fail),
    );
  $("#frame").addEventListener("input", () => {
    const frame = Number($("#frame").value);
    pause();
    render(frame).catch(fail);
  });
  $("#intensity").addEventListener("input", () =>
    setStudy({ intensity: Number($("#intensity").value) }).catch(fail),
  );
  $("#play").addEventListener("click", () => {
    if (state.playing) return pause();
    state.playing = true;
    frameStart = state.frame;
    clockStart = performance.now();
    publish();
    const generation = ++playbackGeneration;
    scheduledFrame = requestAnimationFrame(function studyFrame(time) {
      void tick(time, generation);
    });
  });
  $("#save").addEventListener("click", () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(configuration(), null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.mode}-study.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("#preset-status").textContent =
      "Combination saved with its source and frame settings.";
  });
  $("#open").addEventListener("click", () => $("#preset-file").click());
  $("#preset-file").addEventListener("change", async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 10000) throw new Error("Use a study JSON under 10 KB.");
      const p = JSON.parse(await file.text());
      await setStudy(readConfiguration(p));
      $("#preset-status").textContent = `Opened ${descriptions[p.mode].name}.`;
    } catch (e) {
      $("#preset-status").textContent = e.message;
    } finally {
      event.target.value = "";
    }
  });
} catch (e) {
  fail(e);
}
window.addEventListener("pagehide", () => {
  state.playing = false;
  engine?.dispose();
});

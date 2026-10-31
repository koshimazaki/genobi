/* global document, window, performance, requestAnimationFrame, cancelAnimationFrame, console */
import { createRenderer, FPS, FRAMES, SOURCE } from "./render.js";
const $ = (selector) => document.querySelector(selector);
const descriptions = {
  poster: [
    "QUIET WINDOW",
    "One aligned crop, a fine print texture and a few muted color accents. The surrounding frame remains intact.",
  ],
  water: [
    "WATER GRID",
    "The central 4 × 4 cells stay at the primary time. Small delays and one continuous ripple field gently move the surrounding image.",
  ],
};
const state = {
  mode: "poster",
  intensity: 0.64,
  grid: true,
  frame: 0,
  ready: false,
  playing: false,
};
let engine,
  serial = Promise.resolve(),
  generation = 0,
  scheduled = 0,
  startTime = 0,
  startFrame = 0;
function publish() {
  $("#mode-title").textContent = descriptions[state.mode][0];
  $("#description").textContent = descriptions[state.mode][1];
  $("#frame-status").textContent =
    `FRAME ${String(state.frame).padStart(2, "0")} / 95 · 24 FPS`;
  $("#frame").value = state.frame;
  $("#intensity").value = state.intensity;
  $("#grid").checked = state.grid;
  $("#amount").textContent = `${Math.round(state.intensity * 100)}%`;
  $("#time").textContent = `${(state.frame / FPS).toFixed(2)} / 4.00 s`;
  $("#grid-label").hidden = state.mode !== "water";
  $("#play").textContent = state.playing ? "Ⅱ Pause" : "▶ Play";
  $("#play").setAttribute(
    "aria-label",
    state.playing ? "Pause study" : "Play study",
  );
  for (const button of document.querySelectorAll("[data-mode]"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mode === state.mode),
    );
}
function pause() {
  generation++;
  cancelAnimationFrame(scheduled);
  scheduled = 0;
  state.playing = false;
  publish();
}
function validateFrame(frame) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= FRAMES)
    throw Error("Choose a frame from 0 to 95.");
}
function snapshot() {
  return {
    ...state,
    fps: FPS,
    frames: FRAMES,
    source: { ...SOURCE },
    ...engine?.diagnostics(),
  };
}
function render(frame) {
  validateFrame(frame);
  const config = {
    mode: state.mode,
    intensity: state.intensity,
    grid: state.grid,
  };
  serial = serial.then(() => {
    engine.draw(frame, config);
    state.frame = frame;
    publish();
    return snapshot();
  });
  return serial;
}
async function set(patch) {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    Object.values(patch).some((value) => value === undefined) ||
    Object.keys(patch).some(
      (k) => !["mode", "intensity", "grid", "frame"].includes(k),
    )
  )
    throw Error("Use mode, intensity, grid and frame.");
  if (
    patch.mode !== undefined &&
    (typeof patch.mode !== "string" || !Object.hasOwn(descriptions, patch.mode))
  )
    throw Error("Unknown grid treatment.");
  if (
    patch.intensity !== undefined &&
    (!Number.isFinite(patch.intensity) ||
      patch.intensity < 0 ||
      patch.intensity > 1)
  )
    throw Error("Intensity must be between 0 and 1.");
  if (patch.grid !== undefined && typeof patch.grid !== "boolean")
    throw Error("Grid must be true or false.");
  if (patch.frame !== undefined) validateFrame(patch.frame);
  pause();
  Object.assign(state, patch);
  return render(state.frame);
}
function fail(error) {
  pause();
  $("#loading").hidden = false;
  $("#loading").textContent = error.message;
  $("#loading").setAttribute("role", "alert");
  console.error(error);
}
async function tick(now, token) {
  if (!state.playing || token !== generation) return;
  scheduled = 0;
  const next =
    (startFrame + Math.floor((Math.max(0, now - startTime) * FPS) / 1000)) %
    FRAMES;
  try {
    if (next !== state.frame) await render(next);
    if (state.playing && token === generation)
      scheduled = requestAnimationFrame((time) => tick(time, token));
  } catch (error) {
    fail(error);
  }
}
try {
  engine = await createRenderer($("#output"));
  await document.fonts.ready;
  await render(0);
  state.ready = true;
  $("#loading").hidden = true;
  for (const id of ["play", "frame", "intensity", "grid"])
    $(`#${id}`).disabled = false;
  window.gridStudy = {
    get: snapshot,
    set,
    canvas: $("#output"),
    render: async (frame) => {
      validateFrame(frame);
      pause();
      return render(frame);
    },
  };
  window.render = window.gridStudy.render;
  $("#play").addEventListener("click", () => {
    if (state.playing) {
      pause();
      return;
    }
    state.playing = true;
    startTime = performance.now();
    startFrame = state.frame;
    const token = ++generation;
    publish();
    scheduled = requestAnimationFrame((time) => tick(time, token));
  });
  $("#frame").addEventListener("input", (event) => {
    const frame = Number(event.currentTarget.value);
    window.render(frame).catch(fail);
  });
  $("#intensity").addEventListener("input", (event) => {
    const intensity = Number(event.currentTarget.value);
    set({ intensity }).catch(fail);
  });
  $("#grid").addEventListener("change", (event) => {
    const grid = event.currentTarget.checked;
    set({ grid }).catch(fail);
  });
  for (const button of document.querySelectorAll("[data-mode]"))
    button.addEventListener("click", () =>
      set({ mode: button.dataset.mode }).catch(fail),
    );
  publish();
} catch (error) {
  fail(error);
}

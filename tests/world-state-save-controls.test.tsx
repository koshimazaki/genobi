// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { SceneStateStrip } from "../src/world-builder/SceneStateStrip";
import { SceneStateAudioControls } from "../src/world-builder/SceneStateAudioControls";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { presetRecipe, type Recipe } from "../src/world-builder/recipe";
import { defaultMorphControl } from "../src/world-builder/scene-morph-control";
import { defaultStateAudio } from "../src/world-builder/scene-state-audio";
import { runWork } from "../src/world-builder/session-io";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import {
  controlButton,
  mountWorldControl,
  setControlInput,
  setControlSelect,
} from "./world-ui-harness";

function session(recipe = createMotionPreset("voxel-architecture")) {
  let current = recipe;
  const events: string[] = [],
    errors = vi.fn(),
    render = vi.fn(async (_frame: number) => {}),
    change = vi.fn<(patch: Partial<Recipe>) => Promise<boolean>>(
      async () => true,
    ),
    tune = vi.fn(),
    settled = vi.fn(async () => {}),
    cameraPose = vi.fn(() => {
      events.push("camera");
      return {
        position: [6, 25, 42] as [number, number, number],
        target: [1, 20, 0] as [number, number, number],
        fov: 48,
      };
    }),
    chooseMode = vi.fn((_mode: string, _redraw = true) => events.push("mode")),
    editState = vi.fn(),
    s = {
      recipe,
      frame: 0,
      ready: true,
      busy: false,
      runtime: { current: { editor: { cameraPose, dragging: false } } },
      api: { current: { render, getRecipe: () => current } },
      setPlaying: vi.fn(),
      change,
      tune,
      settled,
      run: runWork(errors),
    } as unknown as BuilderSession,
    e = { mode: "edit", chooseMode, editState } as unknown as WorldEditor;
  return {
    s,
    e,
    events,
    errors,
    render,
    change,
    tune,
    settled,
    cameraPose,
    chooseMode,
    editState,
    current: (next: Recipe) => {
      current = next;
    },
  };
}

function strip(s: BuilderSession, e: WorldEditor, onControls = vi.fn()) {
  return <SceneStateStrip s={s} e={e} onControls={onControls} />;
}

describe("paired shape and camera saves", () => {
  it("captures the view first, settles pending edits and commits both tracks once before seeking", async () => {
    const test = session(),
      { s, e, events, cameraPose, settled, change, render } = test,
      { host } = mountWorldControl(strip(s, e));
    let settle!: () => void, commit!: (ok: boolean) => void;
    settled.mockImplementation(
      () => new Promise<void>((resolve) => (settle = resolve)),
    );
    change.mockImplementation(
      () => new Promise<boolean>((resolve) => (commit = resolve)),
    );
    await act(async () => controlButton(host, "Save current as A").click());
    expect(cameraPose).toHaveBeenCalledOnce();
    expect(events).toEqual(["camera"]);
    expect(change).not.toHaveBeenCalled();
    // A pending gizmo edit settles after the click; it must be in the snapshot.
    const latest = structuredClone(s.recipe),
      id = Object.keys(latest.motion!.stateKeys[0].objects)[0];
    latest.motion!.stateKeys[0].objects[id].x += 1;
    test.current(latest);
    await act(async () => settle());
    expect(events).toEqual(["camera", "mode"]);
    expect(test.chooseMode).toHaveBeenCalledWith("shot", false);
    expect(change).toHaveBeenCalledOnce();
    const next = change.mock.calls[0][0];
    expect(next.motion!.stateKeys[0].objects[id].x).toBe(
      latest.motion!.stateKeys[0].objects[id].x,
    );
    expect(next.cameraMotion!.keys[0]).toMatchObject({
      position: [6, 25, 42],
      target: [1, 20, 0],
      fov: 48,
    });
    expect(render).not.toHaveBeenCalled();
    await act(async () => controlButton(host, "Save current as A").click());
    expect(change).toHaveBeenCalledOnce();
    await act(async () => commit(true));
    expect(render).toHaveBeenCalledExactlyOnceWith(0);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Saved shape and camera as A",
    );
  });

  it("keeps a failed save off the viewport and surfaces snapshot validation errors", async () => {
    const { s, e, change, render, errors, cameraPose } = session(),
      { host } = mountWorldControl(strip(s, e));
    change.mockResolvedValue(false);
    await act(async () => controlButton(host, "Save current as B").click());
    expect(render).not.toHaveBeenCalled();
    expect(host.querySelector('[role="status"]')).toBeNull();
    cameraPose.mockReturnValue({
      position: [900, 25, 42],
      target: [1, 20, 0],
      fov: 48,
    });
    await act(async () => controlButton(host, "Save current as B").click());
    expect(change).toHaveBeenCalledOnce();
    expect(errors.mock.calls.at(-1)?.[0]).toMatch(/camera/i);
    expect(controlButton(host, "Save current as B").disabled).toBe(false);
  });

  it("starts A on a fresh scene and offers a fourth state without removing legacy E", async () => {
    const fresh = session(presetRecipe("Studio")),
      first = mountWorldControl(strip(fresh.s, fresh.e));
    await act(async () =>
      controlButton(first.host, "Save current as A").click(),
    );
    expect(fresh.change.mock.calls[0][0].motion!.stateKeys).toHaveLength(1);
    const test = session(),
      { host, render } = mountWorldControl(strip(test.s, test.e));
    await act(async () => controlButton(host, "Add state D").click());
    const next = test.change.mock.calls[0][0];
    expect(next.motion!.stateKeys).toHaveLength(4);
    expect(next.cameraMotion!.keys).toHaveLength(4);
    test.s.recipe = next as Recipe;
    render(strip(test.s, test.e));
    expect(host.textContent).not.toContain("Add state E");
    const legacy = session(createMotionPreset("fruit-audio-branches"));
    render(strip(legacy.s, legacy.e));
    expect(controlButton(host, "Save current as E")).toBeTruthy();
    expect(host.textContent).not.toContain("Add state F");
  });

  it("edits through the existing state hook and disables saves while busy or walking", async () => {
    const { s, e, editState, change } = session(),
      controls = vi.fn(),
      { host, render } = mountWorldControl(strip(s, e, controls));
    await act(async () =>
      controlButton(
        host,
        `Edit state B: ${s.recipe.motion!.stateKeys[1].label}`,
      ).click(),
    );
    expect(editState).toHaveBeenCalledWith(1);
    expect(controls).toHaveBeenCalledOnce();
    s.busy = true;
    render(strip(s, e));
    expect(controlButton(host, "Save current as A").disabled).toBe(true);
    s.busy = false;
    e.mode = "walk";
    render(strip(s, e));
    expect(controlButton(host, "Save current as A").disabled).toBe(true);
    expect(change).not.toHaveBeenCalled();
  });
});

describe("simple saved-state audio", () => {
  it("starts inactive with distinct band defaults and enables atomically with advanced routing off", async () => {
    const { s, tune, change } = session(),
      motion = s.recipe.motion!;
    motion.morphControl = { ...defaultMorphControl(motion), enabled: true };
    const { host } = mountWorldControl(<SceneStateAudioControls s={s} />),
      toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(toggle.checked).toBe(false);
    expect(
      [...host.querySelectorAll<HTMLSelectElement>("select")].map(
        (select) => select.value,
      ),
    ).toEqual(["low", "mid", "high"]);
    await act(async () => toggle.click());
    expect(tune).toHaveBeenCalledOnce();
    expect(tune.mock.calls[0][0].motion).toMatchObject({
      stateAudio: { enabled: true, amount: 0.65 },
      morphControl: { enabled: false },
    });
    expect(s.recipe.motion!.morphControl!.enabled).toBe(true);
    expect(change).not.toHaveBeenCalled();
  });

  it("lets a state be Off without losing its saved band and tunes zero strength live", async () => {
    const { s, tune, change } = session(),
      motion = s.recipe.motion!;
    motion.stateAudio = { ...defaultStateAudio(motion), enabled: true };
    const { host } = mountWorldControl(<SceneStateAudioControls s={s} />);
    await act(async () =>
      setControlSelect(host, "Audio band for state B", "off"),
    );
    expect(tune.mock.calls.at(-1)![0].motion.stateAudio.routes[1]).toEqual({
      stateId: motion.stateKeys[1].id,
      source: "mid",
      amount: 1,
      enabled: false,
    });
    await act(async () =>
      setControlSelect(host, "Audio band for state A", "sub"),
    );
    expect(
      tune.mock.calls.at(-1)![0].motion.stateAudio.routes[0],
    ).toMatchObject({
      stateId: motion.stateKeys[0].id,
      source: "sub",
      enabled: true,
    });
    await act(async () =>
      setControlInput(host.querySelector('input[type="range"]')!, "0"),
    );
    expect(tune.mock.calls.at(-1)![0].motion.stateAudio.amount).toBe(0);
    expect(change).not.toHaveBeenCalled();
    expect(s.setPlaying).not.toHaveBeenCalled();
    expect(host.textContent).toContain("not individual drums");
  });
});

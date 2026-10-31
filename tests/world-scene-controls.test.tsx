// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneCameraControls } from "../src/world-builder/SceneCameraControls";
import { SceneAudioQuickControls } from "../src/world-builder/SceneAudioQuickControls";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { runWork } from "../src/world-builder/session-io";
import type { Recipe } from "../src/world-builder/recipe";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import { mountWorldControl } from "./world-ui-harness";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));

function mount(children: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(children));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

function session() {
  const render = vi.fn<(frame: number) => Promise<void>>(async () => {});
  const change = vi.fn<(patch: Partial<Recipe>) => Promise<boolean>>(
      async () => true,
    ),
    tune = vi.fn(),
    setPlaying = vi.fn();
  const chooseMode = vi.fn((_mode: string, redraw = true) => {
      // A normal mode change redraws the old frame. Key edits must suppress it.
      if (redraw) void render(20);
    }),
    errors = vi.fn();
  const s = {
    recipe: createMotionPreset("city-to-loft"),
    ready: true,
    busy: false,
    playing: true,
    frame: 20,
    audioName: "My soundtrack",
    audioURL: "blob:track",
    inputState: { phase: "idle", frame: 0 },
    inputTake: { current: null },
    example: { blob: null, label: "", credit: "" },
    api: { current: { render } },
    change,
    tune,
    setPlaying,
    settled: async () => {},
    run: runWork(errors),
  } as unknown as BuilderSession;
  return {
    s,
    e: { chooseMode } as unknown as WorldEditor,
    render,
    change,
    tune,
    setPlaying,
    chooseMode,
  };
}

function inputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function field(host: HTMLElement, label: string) {
  const wrapper = [...host.querySelectorAll("label")].find((el) =>
    el.textContent?.includes(label),
  );
  const input = wrapper?.querySelector("input");
  if (!input) throw new Error(`Missing ${label} control`);
  return input;
}

describe("scene camera edit sequencing", () => {
  it("waits for the edited key to commit before showing its frame, and keeps failed edits off the viewport", async () => {
    const { s, e, render, change } = session();
    const { host, render: rerender } = mountWorldControl(
      <SceneCameraControls s={s} e={e} />,
    );
    const keys = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Camera key"]',
    )!;
    await act(async () => {
      keys.value = "1";
      keys.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(render).toHaveBeenLastCalledWith(
      s.recipe.cameraMotion!.keys[1].frame,
    );
    expect(render).toHaveBeenCalledTimes(1);
    s.frame = s.recipe.cameraMotion!.keys[1].frame;
    rerender(<SceneCameraControls s={s} e={e} />);
    render.mockClear();
    let commit!: (ok: boolean) => void;
    change.mockImplementation(
      () =>
        new Promise((resolve) => {
          commit = resolve;
        }),
    );
    await act(async () => inputValue(field(host, "Path lens"), "47"));
    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0][0].cameraMotion!.keys[1].fov).toBe(47);
    expect(render).not.toHaveBeenCalled();
    await act(async () => commit(true));
    expect(render).toHaveBeenLastCalledWith(
      s.recipe.cameraMotion!.keys[1].frame,
    );
    render.mockClear();
    await act(async () => inputValue(field(host, "Path lens"), "48"));
    await act(async () => commit(false));
    expect(render).not.toHaveBeenCalled();
  });

  it("rewinds reversed travel only after a successful commit", async () => {
    const { s, e, render, change } = session();
    const host = mount(<SceneCameraControls s={s} e={e} />);
    const reverse = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Reverse scene & camera",
    )!;
    let commit!: (ok: boolean) => void;
    change.mockImplementation(
      () =>
        new Promise((resolve) => {
          commit = resolve;
        }),
    );
    await act(async () => reverse.click());
    expect(change).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    await act(async () => commit(false));
    expect(render).not.toHaveBeenCalled();
    await act(async () => reverse.click());
    await act(async () => commit(true));
    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith(0);
  });
});

describe("live audio controls", () => {
  it("tunes camera response without stopping playback or seeking", async () => {
    const { s, e, tune, change, setPlaying, chooseMode, render } = session();
    const host = mount(<SceneCameraControls s={s} e={e} />);
    await act(async () => field(host, "Camera follows audio").click());
    expect(tune).toHaveBeenCalledOnce();
    expect(tune.mock.calls[0][0].cameraMotion.audio.enabled).toBe(true);
    expect(change).not.toHaveBeenCalled();
    expect(setPlaying).not.toHaveBeenCalled();
    expect(chooseMode).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("changes scene gain and enabled bands live while preserving muted mappings", async () => {
    const { s, tune, change, setPlaying } = session();
    const originalIntensity = s.recipe.motion!.intensity;
    s.recipe.motion!.mappings.push({
      id: "muted-test",
      enabled: false,
      source: "high",
      property: "lift",
      amount: 0.5,
    });
    const host = mount(<SceneAudioQuickControls s={s} openSound={() => {}} />);
    await act(async () =>
      inputValue(host.querySelector('input[type="range"]')!, "0"),
    );
    expect(tune).toHaveBeenLastCalledWith(
      expect.objectContaining({
        motion: expect.objectContaining({ intensity: 0 }),
      }),
    );
    const band = host.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      band.value = "sub";
      band.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const next = tune.mock.calls.at(-1)![0].motion;
    expect(
      next.mappings
        .filter((mapping: { enabled: boolean }) => mapping.enabled)
        .every((mapping: { source: string }) => mapping.source === "sub"),
    ).toBe(true);
    expect(next.mappings.at(-1)).toMatchObject({
      enabled: false,
      source: "high",
    });
    expect(change).not.toHaveBeenCalled();
    expect(setPlaying).not.toHaveBeenCalled();
    expect(s.recipe.motion!.intensity).toBe(originalIntensity);
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { SceneMorphRouting } from "../src/world-builder/SceneMorphRouting";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { validateRecipe, type Recipe } from "../src/world-builder/recipe";
import { runWork } from "../src/world-builder/session-io";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import {
  controlInput,
  mountWorldControl,
  setControlSelect,
} from "./world-ui-harness";

function routingSession({ enabled = true, deferred = false } = {}) {
  let current = createMotionPreset("fruit-audio-branches");
  current.motion!.morphControl!.enabled = enabled;
  const pending: (() => void)[] = [];
  const errors = vi.fn();
  const s = {
    ready: true,
    busy: false,
    frame: 0,
    recipe: current,
    inputState: { phase: "idle", frame: 0 },
    api: { current: { getRecipe: () => current } },
    run: runWork(errors),
    tune: vi.fn<(patch: Partial<Recipe>) => Promise<boolean>>((patch) => {
      const commit = () => {
        current = validateRecipe({ ...current, ...patch });
        s.recipe = current;
        return true;
      };
      return deferred
        ? new Promise((resolve) => pending.push(() => resolve(commit())))
        : Promise.resolve(commit());
    }),
  } as unknown as BuilderSession;
  const e = {
    mode: "edit",
    chooseMode: vi.fn(() => {
      e.mode = "shot";
    }),
  } as unknown as WorldEditor;
  return { s, e, pending, errors, current: () => current };
}

function arrow(host: HTMLElement, key: string) {
  host
    .querySelector(".wb-morph-pad")!
    .dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey: true, bubbles: true }),
    );
}

describe("two-axis morph controls", () => {
  it("restores the saved point when a scene configure is rejected", async () => {
    const { s, e, current } = routingSession();
    vi.mocked(s.tune).mockResolvedValueOnce(false);
    const saved = structuredClone(current());
    const { host } = mountWorldControl(<SceneMorphRouting s={s} e={e} />);
    await act(async () => arrow(host, "ArrowRight"));
    expect(s.tune).toHaveBeenCalledOnce();
    expect(controlInput(host, "Manual morph progress").value).toBe("0");
    expect(current()).toEqual(saved);
  });

  it("coalesces rapid gestures to the final independent axis values and enters Shot without an obsolete redraw", async () => {
    const { s, e, pending, current } = routingSession({ deferred: true });
    const targets = structuredClone(
      current().motion!.morphControl!.target.routes,
    );
    const { host } = mountWorldControl(<SceneMorphRouting s={s} e={e} />);
    await act(async () => arrow(host, "ArrowRight"));
    await act(async () => arrow(host, "ArrowUp"));
    await act(async () => arrow(host, "ArrowRight"));
    expect(s.tune).toHaveBeenCalledOnce();
    expect(e.chooseMode).toHaveBeenCalledOnce();
    expect(e.chooseMode).toHaveBeenCalledWith("shot", false);
    await act(async () => pending.shift()!());
    expect(s.tune).toHaveBeenCalledTimes(2);
    await act(async () => pending.shift()!());
    const control = current().motion!.morphControl!;
    expect(control.progress.position).toBeCloseTo(0.2);
    expect(control.target.position).toBeCloseTo(0.1);
    expect(control.target.routes).toEqual(targets);
    expect(e.chooseMode).toHaveBeenCalledOnce();
    await act(async () => arrow(host, "End"));
    await act(async () => arrow(host, "ArrowRight"));
    await act(async () => pending.shift()!());
    await act(async () => pending.shift()!());
    expect(current().motion!.morphControl!.progress.position).toBe(1);
    expect(current().motion!.morphControl!.target.position).toBeCloseTo(0.1);
  });

  it("changes a target's measured band without changing progress, and never adds the origin as its own target", async () => {
    const { s, e, current } = routingSession();
    const { host } = mountWorldControl(<SceneMorphRouting s={s} e={e} />);
    await act(async () => setControlSelect(host, "Apple audio band", "sub"));
    expect(current().motion!.morphControl!.progress).toEqual({
      mode: "manual",
      position: 0,
      source: "level",
      amount: 1,
    });
    expect(
      current().motion!.morphControl!.target.routes.find(
        (item) => item.stateId === "fruit-apple",
      )!.source,
    ).toBe("sub");
    const before = vi.mocked(s.tune).mock.calls.length;
    await act(async () =>
      setControlSelect(host, "Morph origin shape", "fruit-banana"),
    );
    expect(s.tune).toHaveBeenCalledTimes(before);
    await act(async () =>
      setControlSelect(host, "Morph origin shape", "fruit-apple"),
    );
    const controller = current().motion!.morphControl!;
    expect(controller.originStateId).toBe("fruit-apple");
    expect(
      controller.target.routes.some((item) => item.stateId === "fruit-apple"),
    ).toBe(false);
    expect(
      controller.target.routes.some((item) => item.stateId === "fruit-banana"),
    ).toBe(true);
    expect(() => validateRecipe(current())).not.toThrow();
    await act(async () => controlInput(host, "Use morph plane").click());
    expect(current().motion!.morphControl!.enabled).toBe(false);
    expect(host.querySelector("fieldset")!.disabled).toBe(true);
    expect(
      host
        .querySelector('select[aria-label="Morph origin shape"]')!
        .closest(".themed-select")!
        .querySelector("button")!.disabled,
    ).toBe(true);
    expect(current().motion!.morphControl!.target.routes).toEqual(
      controller.target.routes,
    );
  });

  it("shows the same live spectral weights as the transient scene while retaining the saved soundtrack", () => {
    const { s, e } = routingSession();
    s.recipe.envelope = [0.8, 0.8];
    s.recipe.bandEnvelopes = { low: [0, 0], mid: [0, 0], high: [1, 1] };
    s.busy = true;
    s.inputState = {
      phase: "recording",
      frame: 0,
      signals: { level: 0.3, low: 1, mid: 0, high: 0, sub: 0 },
    };
    const saved = structuredClone(s.recipe);
    const { host } = mountWorldControl(<SceneMorphRouting s={s} e={e} />);
    expect(
      host.querySelector<HTMLMeterElement>(
        'meter[aria-label="Apple target weight"]',
      )!.value,
    ).toBe(1);
    expect(
      host.querySelector<HTMLMeterElement>(
        'meter[aria-label="Watermelon target weight"]',
      )!.value,
    ).toBe(0);
    expect(host.querySelector(".wb-morph-pad-legend")!.textContent).toContain(
      "Live input",
    );
    expect(host.querySelector(".wb-morph-pad-legend")!.textContent).toContain(
      "Apple · 30%",
    );
    expect(controlInput(host, "Use morph plane").disabled).toBe(true);
    expect(s.tune).not.toHaveBeenCalled();
    expect(s.recipe).toEqual(saved);
  });
});

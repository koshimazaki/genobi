// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewportLightbox } from "../src/world-builder/ViewportLightbox";
import { MorphComposer } from "../src/world-builder/MorphComposer";
import * as catalogue from "../src/world-builder/morph-asset-catalogue";
import { ScenePresetDetail } from "../src/world-builder/ScenePresetDetail";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import type { Recipe } from "../src/world-builder/recipe";
import type { ScenePreset } from "../src/world-builder/world-presets";
import {
  controlButton,
  controlInput,
  mountWorldControl,
  setControlInput,
  setControlSelect,
} from "./world-ui-harness";

afterEach(() => vi.restoreAllMocks());

// Geometry correctness is covered by projection tests. These exercise applying
// drafts, validation failures and the real canvas host's lifecycle.
vi.mock("../src/world-builder/SceneStatePreview", () => ({
  SceneStatePreview: () => <svg aria-hidden="true" />,
}));

describe("expanded viewport", () => {
  it("moves the same live canvas, preserves child state, and restores focus on Escape and Close", async () => {
    const mounts = vi.fn(),
      unmounts = vi.fn();
    // jsdom has the element but not the browser's top-layer methods.
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.setAttribute("open", "");
        },
      },
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.removeAttribute("open");
        },
      },
    });
    function LiveScene() {
      const [plays, setPlays] = useState(0);
      useEffect(() => {
        mounts();
        return unmounts;
      }, []);
      return (
        <>
          <canvas tabIndex={0} />
          <button onClick={() => setPlays(plays + 1)}>Play {plays}</button>
        </>
      );
    }
    const { host, render } = mountWorldControl(
      <ViewportLightbox>
        <LiveScene />
      </ViewportLightbox>,
    );
    const canvas = host.querySelector("canvas")!;
    const expand = controlButton(host, "Expand 3D scene");
    await act(async () => {
      expand.focus();
      expand.click();
    });
    const dialog = host.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("canvas")).toBe(canvas);
    expect(document.activeElement).toBe(
      controlButton(host, "Close expanded 3D scene"),
    );
    await act(async () => controlButton(host, "Play 0").click());
    await act(async () =>
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(dialog.open).toBe(false);
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(document.activeElement).toBe(expand);
    expect(controlButton(host, "Play 1")).toBeTruthy();
    await act(async () => {
      canvas.focus();
      canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(dialog.querySelector("canvas")).toBe(canvas);
    await act(async () =>
      controlButton(host, "Close expanded 3D scene").click(),
    );
    expect(document.activeElement).toBe(canvas);
    await act(async () => expand.click());
    render(
      <ViewportLightbox active={false}>
        <LiveScene />
      </ViewportLightbox>,
    );
    expect(dialog.open).toBe(false);
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(mounts).toHaveBeenCalledOnce();
    expect(unmounts).not.toHaveBeenCalled();
  });
});

describe("morph composition drafts", () => {
  it("offers a 30-second frame-grid fader and exposes the rounded container duration before loading", async () => {
    const load = vi.fn<(recipe: Recipe) => void>();
    const { host } = mountWorldControl(
      <MorphComposer load={load} disabled={false} close={() => {}} />,
    );
    const slider = controlInput(host, "Total morph time slider");
    expect(slider.max).toBe("721");
    expect(slider.step).toBe("8");
    await act(async () => setControlInput(slider, "713"));
    expect(
      host.querySelector(".wb-morph-duration output")!.textContent,
    ).toContain("713 frames");
    await act(async () => setControlInput(slider, "721"));
    expect(controlButton(host, "Load morph").disabled).toBe(false);
    await act(async () => controlButton(host, "Load morph").click());
    expect(load.mock.calls[0][0].frames).toBe(721);
    load.mockClear();
    await act(async () =>
      setControlInput(controlInput(host, "Total morph time"), "30"),
    );
    expect(
      host.querySelector(".wb-morph-duration output")!.textContent,
    ).toContain("721 frames at 24 fps · 30.0417 s actual");
    expect(load).not.toHaveBeenCalled();
    await act(async () => controlButton(host, "Load morph").click());
    expect(load.mock.calls[0][0].frames).toBe(721);
    expect(load.mock.calls[0][0].motion!.stateKeys.at(-1)!.frame).toBe(720);
  });

  it("tick-selects A–D, enforces the four-form limit, and applies the total time and algorithm only on Load", async () => {
    const load = vi.fn<(recipe: Recipe) => void>();
    const { host } = mountWorldControl(
      <MorphComposer load={load} disabled={false} close={() => {}} />,
    );
    expect(controlInput(host, "Total morph time").value).toBe("8");
    await act(async () => controlInput(host, "Include Pyramid").click());
    await act(async () => controlInput(host, "Include Cathedral").click());
    expect(controlButton(host, "Load morph").disabled).toBe(true);
    expect(host.querySelector(".wb-morph-draft-empty")!.textContent).toContain(
      "at least two",
    );
    for (const name of ["Banana", "Apple", "Orange", "Watermelon"])
      await act(async () => controlInput(host, `Include ${name}`).click());
    expect(controlInput(host, "Include Mecha").disabled).toBe(true);
    await act(async () => controlButton(host, "Move form D earlier").click());
    expect(
      controlInput(host, "Include Watermelon")
        .closest("label")!
        .querySelector("b")!.textContent,
    ).toBe("C");
    expect(
      controlInput(host, "Include Orange").closest("label")!.querySelector("b")!
        .textContent,
    ).toBe("D");
    await act(async () => controlInput(host, "Include Orange").click());
    expect(controlInput(host, "Include Mecha").disabled).toBe(false);
    await act(async () => controlInput(host, "Include Orange").click());
    await act(async () =>
      setControlInput(controlInput(host, "Total morph time"), "6"),
    );
    await act(async () =>
      setControlSelect(host, "Morph transition style", "twist"),
    );
    await act(async () =>
      setControlInput(controlInput(host, "Morph composition preview"), "0.8"),
    );
    expect(load).not.toHaveBeenCalled();
    await act(async () => controlButton(host, "Load morph").click());
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0][0]).toMatchObject({
      frames: 145,
      motion: {
        instances: { count: 64 },
        transitionStyle: "twist",
        stateKeys: [
          { label: "Banana", frame: 0 },
          { label: "Apple", frame: 48 },
          { label: "Watermelon", frame: 96 },
          { label: "Orange", frame: 144 },
        ],
      },
    });
  });

  it("keeps ticked forms and requested detail after a rejected recipe, then recovers after a smaller detail choice", async () => {
    const factory = catalogue.createMorphComposition;
    vi.spyOn(catalogue, "createMorphComposition").mockImplementation(
      (options) => {
        if (options.count === 256)
          throw new Error(
            "Choose fewer blocks or fewer states to leave room for a soundtrack.",
          );
        return factory(options);
      },
    );
    const load = vi.fn<(recipe: Recipe) => void>();
    const { host } = mountWorldControl(
      <MorphComposer load={load} disabled={false} close={() => {}} />,
    );
    await act(async () => controlInput(host, "Include Pyramid").click());
    await act(async () => controlInput(host, "Include Apple").click());
    await act(async () =>
      setControlSelect(host, "Morph composition detail", "256"),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "fewer blocks or fewer states",
    );
    expect(controlButton(host, "Load morph").disabled).toBe(true);
    expect(controlInput(host, "Include Apple").checked).toBe(true);
    expect(controlInput(host, "Include Cathedral").checked).toBe(true);
    expect(
      host.querySelector<HTMLSelectElement>(
        'select[aria-label="Morph composition detail"]',
      )?.value,
    ).toBe("256");
    expect(load).not.toHaveBeenCalled();
    await act(async () =>
      setControlSelect(host, "Morph composition detail", "128"),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await act(async () => controlButton(host, "Load morph").click());
    expect(load.mock.calls[0][0].motion!.instances!.count).toBe(128);
    expect(
      load.mock.calls[0][0].motion!.stateKeys.map((key) => key.label),
    ).toEqual(["Cathedral", "Apple"]);
  });

  it("plays, pauses and scrubs the timed draft without loading it or triggering the World shortcut", async () => {
    let clock = 0,
      next = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.set(++next, callback);
      return next;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const advance = (ms: number) => {
      clock += ms;
      const frames = [...callbacks.values()];
      callbacks.clear();
      for (const callback of frames) callback(clock);
    };
    const load = vi.fn<(recipe: Recipe) => void>();
    const close = vi.fn();
    const { host, render } = mountWorldControl(
      <MorphComposer load={load} disabled={false} close={close} />,
    );
    await act(async () =>
      setControlInput(controlInput(host, "Total morph time"), "6"),
    );
    await act(async () => controlButton(host, "Play morph draft").click());
    const globalShortcut = vi.fn();
    window.addEventListener("keydown", globalShortcut);
    await act(async () =>
      controlButton(host, "Pause morph draft").dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          bubbles: true,
        }),
      ),
    );
    window.removeEventListener("keydown", globalShortcut);
    expect(globalShortcut).not.toHaveBeenCalled();
    await act(async () => advance(3000));
    expect(
      Number(controlInput(host, "Morph composition preview").value),
    ).toBeCloseTo(0.5);
    await act(async () => controlButton(host, "Pause morph draft").click());
    expect(callbacks.size).toBe(0);
    await act(async () => advance(1000));
    expect(
      Number(controlInput(host, "Morph composition preview").value),
    ).toBeCloseTo(0.5);
    await act(async () =>
      setControlInput(controlInput(host, "Morph composition preview"), "0.25"),
    );
    await act(async () => controlButton(host, "Play morph draft").click());
    await act(async () => advance(4500));
    expect(controlInput(host, "Morph composition preview").value).toBe("1");
    expect(controlButton(host, "Play morph draft")).toBeTruthy();
    await act(async () => controlButton(host, "Play morph draft").click());
    expect(controlInput(host, "Morph composition preview").value).toBe("0");
    render(
      <MorphComposer
        load={load}
        disabled={false}
        close={close}
        active={false}
      />,
    );
    expect(callbacks.size).toBe(0);
    expect(load).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

it("changes architecture detail without discarding the draft duration, background or floor", async () => {
  const preset: ScenePreset = {
    name: "Architecture",
    file: "voxel-architecture",
    source: "built-in",
    summary: "Three forms",
    recipe: createMotionPreset("voxel-architecture"),
  };
  const original = structuredClone(preset.recipe);
  const load = vi.fn<(preset: ScenePreset) => void>();
  const { host } = mountWorldControl(
    <ScenePresetDetail preset={preset} disabled={false} load={load} />,
  );
  await act(async () =>
    setControlInput(controlInput(host, "Preset duration"), "121"),
  );
  await act(async () =>
    setControlInput(controlInput(host, "Preset background"), "#243246"),
  );
  await act(async () => setControlSelect(host, "Preset floor", "studio"));
  await act(async () =>
    setControlSelect(host, "Architecture detail", "voxel-architecture-256"),
  );
  expect(load).not.toHaveBeenCalled();
  expect(preset.recipe).toEqual(original);
  await act(async () => controlButton(host, "Load scene").click());
  expect(load.mock.calls[0][0].recipe).toMatchObject({
    frames: 121,
    background: "#243246",
    stageLook: "studio",
    motion: { instances: { count: 256 } },
  });
  expect(
    load.mock.calls[0][0].recipe.motion!.stateKeys.at(-1)!.frame,
  ).toBeLessThan(121);
});

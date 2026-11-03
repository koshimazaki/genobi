// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  commitSceneSize,
  SceneSizeControls,
} from "../src/world-builder/SceneSizeControls";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { Recipe } from "../src/world-builder/recipe";
import type { RecipeGuard } from "../src/world-builder/scene-adapter";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

function session() {
  let current = createMotionPreset("apartment-morph"),
    revision = 3;
  const adapter = {
    getRecipe: () => structuredClone(current),
    getRecipeRevision: () => String(revision),
    configure: vi.fn(async (next: Recipe, guard: RecipeGuard) => {
      if (guard.expectedRevision !== String(revision))
        throw new Error("Scene changed");
      current = next;
      revision++;
      return next;
    }),
    render: vi.fn(async () => {}),
  };
  const s = {
    recipe: current,
    frame: 72,
    ready: true,
    busy: false,
    capturing: false,
    api: { current: adapter },
    runtime: { current: { frame: 72 } },
    setPlaying: vi.fn(),
    settled: vi.fn(async () => {}),
    run: vi.fn(async (work: () => Promise<unknown>) => {
      try {
        await work();
        return true;
      } catch {
        return false;
      }
    }),
  } as unknown as BuilderSession;
  return { s, adapter, current: () => current, edit: () => revision++ };
}

it("resizes only when the fader is committed, preserving the inspected playhead", async () => {
  const h = session();
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(<SceneSizeControls s={h.s} />));
  const slider = document.querySelector<HTMLInputElement>(
    'input[aria-label="Scene size slider"]',
  )!;
  expect(Number(slider.value)).toBe(1);
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(slider, "1.5");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(h.adapter.configure).not.toHaveBeenCalled();
  await act(async () => {
    slider.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  expect(h.s.setPlaying).toHaveBeenCalledWith(false);
  expect(h.adapter.configure).toHaveBeenCalledWith(
    expect.objectContaining({ sceneSize: { version: 1, factor: 1.5 } }),
    { expectedRevision: "3" },
  );
  expect(h.adapter.render).toHaveBeenCalledWith(72);
});

it("does not replace a newer recipe while waiting for the previous preview draw", async () => {
  const h = session();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(h.s.settled).mockReturnValue(wait);
  const pending = commitSceneSize(h.s, 1.5);
  h.edit();
  release();
  await expect(pending).rejects.toThrow("Scene changed");
  expect(h.current().sceneSize).toBeUndefined();
  expect(h.adapter.render).not.toHaveBeenCalled();
});

it("rejects non-finite typed size before configuring the scene", async () => {
  const h = session();
  await expect(commitSceneSize(h.s, Infinity)).rejects.toThrow();
  expect(h.adapter.configure).not.toHaveBeenCalled();
});

it("keeps a precise fixed size valid when no coarser slider step can fit", () => {
  const h = session();
  h.s.recipe.sceneSize = { version: 1, factor: 1.005 };
  h.s.recipe.objects[0].scale = 0.1;
  h.s.recipe.objects[1].scale = 32;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(<SceneSizeControls s={h.s} />));
  const slider = document.querySelector<HTMLInputElement>(
    'input[aria-label="Scene size slider"]',
  )!;
  expect(Number(slider.min)).toBe(1.005);
  expect(Number(slider.max)).toBe(1.005);
  expect(slider.disabled).toBe(true);
  expect(Number(slider.value)).toBe(1.005);
});

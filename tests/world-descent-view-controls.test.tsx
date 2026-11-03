// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  DescentCameraControls,
  DescentViewControls,
} from "../src/world-builder/DescentViewControls";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import type { Recipe } from "../src/world-builder/recipe";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

function mount() {
  return (root = createRoot(
    document.body.appendChild(document.createElement("div")),
  ));
}
function lensSlider() {
  return document.querySelector<HTMLInputElement>(
    'input[aria-label="Descent FOV slider"]',
  )!;
}
function draftLens(value: number) {
  const slider = lensSlider();
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(slider, String(value));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function commitLens() {
  await act(async () => {
    lensSlider().dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
}

it("commits the whole descent lens on release without changing the camera path", async () => {
  const recipe = createMotionPreset("endless-descent"),
    onChange = vi.fn();
  mount();
  act(() =>
    root!.render(<DescentViewControls recipe={recipe} onChange={onChange} />),
  );
  draftLens(84);
  expect(onChange).not.toHaveBeenCalled();
  await commitLens();
  expect(onChange).toHaveBeenCalledTimes(1);
  const next = onChange.mock.calls[0][0] as Recipe;
  expect(next.fov).toBe(84);
  expect(next.cameraMotion!.keys).toEqual(
    recipe.cameraMotion!.keys.map((key) => ({ ...key, fov: 84 })),
  );
  expect(next.motion).toEqual(recipe.motion);
});

it.each(["synchronous", "asynchronous"])(
  "recovers from a %s view update failure and allows a retry",
  async (kind) => {
    const recipe = createMotionPreset("endless-descent"),
      onChange = vi
        .fn<(next: Recipe) => void | Promise<unknown>>()
        .mockImplementationOnce(() => {
          if (kind === "synchronous") throw new Error("Lens update failed");
          return Promise.reject(new Error("Lens update failed"));
        });
    mount();
    act(() =>
      root!.render(<DescentViewControls recipe={recipe} onChange={onChange} />),
    );
    draftLens(82);
    await commitLens();
    expect(document.querySelector('[role="alert"]')!.textContent).toBe(
      "Lens update failed",
    );
    expect(lensSlider().closest("fieldset")!.disabled).toBe(false);
    expect(Number(lensSlider().value)).toBe(75);
    draftLens(83);
    await commitLens();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  },
);

it("preserves an imperative scene edit until the rendered controls catch up", async () => {
  const rendered = createMotionPreset("endless-descent"),
    current = { ...rendered, light: rendered.light + 0.1 },
    configure = vi.fn(async () => {}),
    render = vi.fn(async () => {}),
    chooseMode = vi.fn();
  const s = {
    recipe: rendered,
    frame: 192,
    ready: true,
    busy: false,
    capturing: false,
    api: {
      current: {
        getRecipe: () => structuredClone(current),
        getRecipeRevision: () => "scene:4",
        configure,
        render,
      },
    },
    settled: vi.fn(async () => {}),
    run: vi.fn(async (work: () => Promise<unknown>) => {
      await work();
      return true;
    }),
  } as unknown as BuilderSession;
  const e = { mode: "shot", chooseMode } as unknown as WorldEditor;
  mount();
  const redraw = () =>
    act(() => root!.render(<DescentCameraControls s={s} e={e} />));
  redraw();
  draftLens(82);
  await commitLens();
  expect(configure).not.toHaveBeenCalled();
  expect(chooseMode).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')!.textContent).toMatch(
    /scene changed/i,
  );
  s.recipe = current;
  redraw();
  draftLens(82);
  await commitLens();
  expect(configure).toHaveBeenCalledWith(
    expect.objectContaining({ light: current.light, fov: 82 }),
    { expectedRevision: "scene:4" },
  );
  expect(render).toHaveBeenCalledWith(192);
});

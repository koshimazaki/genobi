// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { TakeLength } from "../src/world-builder/TakeLength";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { Recipe } from "../src/world-builder/recipe";
import {
  controlInput,
  mountWorldControl,
  setControlInput,
} from "./world-ui-harness";

it("previews a length drag, commits once on release, and restores the current take if it is refused", async () => {
  let finish!: (ok: boolean) => void;
  const change = vi.fn<(patch: Partial<Recipe>) => Promise<boolean>>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const s = {
    recipe: createMotionPreset("city-to-loft"),
    change,
  } as unknown as BuilderSession;
  const { host } = mountWorldControl(<TakeLength s={s} />);
  const slider = controlInput(host, "Take length slider");
  const before = slider.value;
  expect(slider.max).toBe("721");
  expect(slider.step).toBe("8");
  await act(async () => setControlInput(slider, "641"));
  await act(async () => setControlInput(slider, "721"));
  expect(change).not.toHaveBeenCalled();
  expect(host.querySelector("output")!.textContent).toBe("721 f");
  await act(async () =>
    slider.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })),
  );
  await act(async () =>
    slider.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(change).toHaveBeenCalledOnce();
  expect(change).toHaveBeenCalledWith({ frames: 721 });
  expect(slider.disabled).toBe(true);
  await act(async () => finish(false));
  expect(slider.value).toBe(before);
  expect(slider.disabled).toBe(false);
  await act(async () => setControlInput(slider, "201"));
  await act(async () =>
    slider.dispatchEvent(
      new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(change).toHaveBeenLastCalledWith({ frames: 201 });
  await act(async () => finish(true));
});

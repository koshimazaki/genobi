// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { SceneCameraControls } from "../src/world-builder/SceneCameraControls";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import type { Recipe } from "../src/world-builder/recipe";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import { mountWorldControl, setControlInput } from "./world-ui-harness";

it("edits the camera nearest the selected scene state instead of silently changing A", async () => {
  const recipe = createMotionPreset("city-to-loft");
  recipe.cameraMotion!.keys.forEach((key, index) => {
    key.fov = 40 + index * 10;
  });
  const change = vi.fn<(patch: Partial<Recipe>) => Promise<boolean>>(
      async () => true,
    ),
    renderFrame = vi.fn(async () => {});
  const s = {
    recipe,
    frame: recipe.cameraMotion!.keys[1].frame,
    change,
    run: (run: () => Promise<unknown>) => run(),
    api: { current: { render: renderFrame } },
  } as unknown as BuilderSession;
  const e = { chooseMode: vi.fn() } as unknown as WorldEditor;
  const { host, render } = mountWorldControl(
    <SceneCameraControls s={s} e={e} />,
  );
  expect(
    host.querySelector<HTMLSelectElement>('select[aria-label="Camera key"]')!
      .value,
  ).toBe("1");
  const lens = [...host.querySelectorAll("label")]
    .find((label) => label.textContent?.trim() === "Path lens °")!
    .querySelector("input")!;
  expect(lens.value).toBe("50");
  await act(async () => setControlInput(lens, "52"));
  expect(
    change.mock.calls[0][0].cameraMotion!.keys.map(
      (key: { fov: number }) => key.fov,
    ),
  ).toEqual([40, 52, 60]);
  expect(renderFrame).toHaveBeenCalledWith(recipe.cameraMotion!.keys[1].frame);
  render(
    <SceneCameraControls
      s={{ ...s, frame: recipe.cameraMotion!.keys[2].frame }}
      e={e}
    />,
  );
  expect(
    host.querySelector<HTMLSelectElement>('select[aria-label="Camera key"]')!
      .value,
  ).toBe("2");
});

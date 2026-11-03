// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { AvatarPlacement } from "../src/world-builder/AvatarPlacement";
import { ObjectInspector } from "../src/world-builder/ObjectInspector";
import { validateRecipe } from "../src/world-builder/recipe";
import { scaledAxes } from "../src/world-builder/scene-contract";
import { factorPrimitiveScale } from "../src/world-builder/scene-bounds";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import { mountWorldControl, setControlInput } from "./world-ui-harness";

function field(host: HTMLElement, label: string) {
  const wrapper = [...host.querySelectorAll("label")].find((el) =>
    el.textContent?.includes(label),
  );
  const input = wrapper?.querySelector("input");
  if (!input) throw new Error(`Missing ${label} control`);
  return input;
}

describe("metre-sized object and character controls", () => {
  it("edits a large object's physical axes at exact bounds without shrinking its other axes or baking presence", () => {
    const recipe = validateRecipe({
      objects: [
        {
          id: "tower",
          shape: "box",
          x: 100,
          y: 50,
          z: 0,
          ...factorPrimitiveScale([16, 100, 4]),
          presence: 0.5,
          color: "#aabbcc",
          spin: 0,
          prompt: "",
        },
      ],
    });
    const part = recipe.objects[0],
      patch = vi.fn();
    const s = { recipe } as BuilderSession;
    const e = {
      transform: part,
      prop: part,
      selected: "prop:tower",
      authored: true,
      objects: [part],
      patchObject: patch,
      select: vi.fn(),
      remove: vi.fn(),
    } as unknown as WorldEditor;
    const { host } = mountWorldControl(<ObjectInspector s={s} e={e} />);
    const height = field(host, "Size Y");
    expect(height.value).toBe("100");
    expect(height.max).toBe("256");
    act(() => setControlInput(height, height.max));
    const next = { ...part, ...patch.mock.calls.at(-1)![0] };
    expect(scaledAxes({ ...next, presence: 1 })).toEqual([16, 256, 4]);
    expect(next.presence).toBe(0.5);
    expect(() => validateRecipe({ ...recipe, objects: [next] })).not.toThrow();
    act(() => setControlInput(field(host, "Position X"), "200"));
    expect(patch).toHaveBeenLastCalledWith({ x: 200 });
    act(() => setControlInput(field(host, "Position X"), "-200"));
    expect(patch).toHaveBeenLastCalledWith({ x: -200 });
  });

  it("accepts exact high and low character positions in the same authoring range", () => {
    const change = vi.fn();
    const s = {
      recipe: validateRecipe({ avatar: true }),
      change,
    } as unknown as BuilderSession;
    const { host } = mountWorldControl(<AvatarPlacement s={s} />);
    const height = field(host, "Character y");
    expect(height.min).toBe("-200");
    expect(height.max).toBe("200");
    act(() => setControlInput(height, "200"));
    expect(change.mock.calls.at(-1)![0].avatarPose.y).toBe(200);
    act(() => setControlInput(height, "-200"));
    expect(change.mock.calls.at(-1)![0].avatarPose.y).toBe(-200);
  });
});

import { describe, expect, it, vi } from "vitest";
import { commitViewportEdit } from "../src/world-builder/viewport-edit";
import {
  createEditLock,
  createLoadingEditLock,
} from "../src/world-builder/edit-lock";
import { presetRecipe } from "../src/world-builder/recipe";
import type { SceneAdapter } from "../src/world-builder/scene-adapter";
import type { WorldRuntime } from "../src/world-builder/runtime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("camera gesture commit ownership", () => {
  it("holds edits until both recipe commit and the edited preview frame land", async () => {
    const configured = deferred<void>(),
      rendered = deferred<void>(),
      apply = vi.fn(),
      lock = createEditLock(apply),
      recipe = presetRecipe("Studio"),
      fail = vi.fn();
    const adapter = {
      getRecipe: () => recipe,
      configure: vi.fn(() => configured.promise),
      render: vi.fn(() => rendered.promise),
    } as unknown as SceneAdapter;
    const world = {
      editor: { holdEdits: lock.hold },
      renderFrame: vi.fn(),
    } as unknown as WorldRuntime;
    const work = commitViewportEdit(
      adapter,
      world,
      { cameraShot: "custom" },
      37,
      () => true,
      fail,
    );
    expect(apply).toHaveBeenLastCalledWith(true);
    configured.resolve();
    await Promise.resolve();
    expect(adapter.render).toHaveBeenCalledWith(37);
    expect(apply).toHaveBeenLastCalledWith(true);
    rendered.resolve();
    await work;
    expect(apply).toHaveBeenLastCalledWith(false);
    expect(fail).not.toHaveBeenCalled();
  });

  it("restores the authored view on refusal and releases after unmount", async () => {
    const recipe = presetRecipe("Studio"),
      failure = new Error("Camera key is outside the scene bounds."),
      release = vi.fn(),
      fail = vi.fn();
    const adapter = {
      getRecipe: () => recipe,
      configure: vi.fn().mockRejectedValue(failure),
      render: vi.fn(),
    } as unknown as SceneAdapter;
    const world = {
      editor: { holdEdits: () => release },
      renderFrame: vi.fn().mockResolvedValue(undefined),
    } as unknown as WorldRuntime;
    await commitViewportEdit(adapter, world, {}, 37, () => true, fail);
    expect(fail).toHaveBeenCalledWith(failure);
    expect(world.renderFrame).toHaveBeenCalledWith(37);
    expect(adapter.render).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    fail.mockClear();
    vi.mocked(world.renderFrame).mockClear();
    await commitViewportEdit(adapter, world, {}, 37, () => false, fail);
    expect(fail).not.toHaveBeenCalled();
    expect(world.renderFrame).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("loading releases only its own hold, including an idempotent late cleanup", () => {
    const apply = vi.fn(),
      report = vi.fn(),
      lock = createEditLock(apply),
      loading = createLoadingEditLock(lock.hold, report);
    loading.set(true, false);
    loading.set(true, false);
    expect(loading.active).toBe(true);
    expect(report).not.toHaveBeenCalled();
    lock.set(true);
    loading.set(false);
    loading.set(false);
    expect(loading.active).toBe(false);
    expect(apply).toHaveBeenLastCalledWith(true);
    lock.set(false);
    expect(apply).toHaveBeenLastCalledWith(false);
    expect(report).toHaveBeenLastCalledWith(false);
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { WORLD_TAKE_NAME } from "../shared/world-control";
import { readLoopSlots } from "../src/world-builder/scene-loop-storage";
import { shotPatch } from "../src/world-builder/camera-shots";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import {
  controlButton,
  controlInput,
  setControlInput,
  setControlSelect,
} from "./world-ui-harness";
import { loopTestScene, mountLoopDesk } from "./world-loop-ui-harness";

beforeEach(() => localStorage.clear());

async function savePair(test: ReturnType<typeof mountLoopDesk>) {
  await act(async () => controlButton(test.host, "Save A").click());
  test.load(loopTestScene(3, "#7dab8f"));
  await act(async () => controlButton(test.host, "Save B").click());
}

describe("the global Loop desk", () => {
  it("keeps A across asset loads, saves only B, and recalls A with the current soundtrack", async () => {
    const test = mountLoopDesk(),
      { host, s, configure } = test;
    expect(controlButton(host, "Play loop").disabled).toBe(true);
    await act(async () => controlButton(host, "Save A").click());
    const originalA = readLoopSlots().bank.slots[0];
    expect(originalA!.camera.fov).toBe(s.recipe.fov);
    expect(controlButton(host, "Save B")).toBeTruthy();
    expect(configure).not.toHaveBeenCalled();
    const next = validateRecipe({
      ...loopTestScene(3, "#7dab8f"),
      envelope: [0.2, 0.7],
      bandEnvelopes: { sub: [0.4], low: [0.3], mid: [0.2], high: [0.1] },
    });
    test.load(next);
    expect(readLoopSlots().bank.slots[0]).toEqual(originalA);
    await act(async () => controlButton(host, "Save B").click());
    expect(readLoopSlots().bank.slots[0]).toEqual(originalA);
    expect(
      readLoopSlots().bank.slots[1]!.recipe.motion!.stateKeys[0].objects.box.x,
    ).toBe(3);
    expect(s.recipe).toEqual(next);
    expect(configure).not.toHaveBeenCalled();
    await act(async () =>
      controlButton(host, "Loop slot A: Scene view").click(),
    );
    expect(s.recipe.motion!.stateKeys[0].objects.box.x).toBe(0);
    expect(s.recipe.cameraMotion!.keys[0].fov).toBe(originalA!.camera.fov);
    expect(s.recipe.envelope).toEqual(next.envelope);
    expect(s.recipe.bandEnvelopes).toEqual(next.bandEnvelopes);
    expect(test.e.chooseMode).toHaveBeenCalledWith("shot", false);
    expect(test.events).toEqual(["configure", "render:0"]);
    expect(readLoopSlots().bank.slots[0]).toEqual(originalA);
  });

  it("keeps duration and algorithm local, then composes the 721-frame A→B→A loop", async () => {
    const test = mountLoopDesk(),
      { host, s, configure } = test;
    await savePair(test);
    const current = structuredClone(s.recipe);
    await act(async () => {
      setControlInput(controlInput(host, "Loop duration slider"), "721");
      setControlSelect(host, "Loop morph algorithm", "scatter");
    });
    expect(s.recipe).toEqual(current);
    expect(configure).not.toHaveBeenCalled();
    expect(host.textContent).toContain("721 frames · 24 fps · 30.04 s video");
    expect(controlInput(host, "Loop duration in seconds").value).toBe("30.00");
    expect(controlButton(host, "Play loop").disabled).toBe(false);
    await act(async () => controlButton(host, "Play loop").click());
    expect(s.recipe.frames).toBe(721);
    expect(s.recipe.motion!.transitionStyle).toBe("scatter");
    expect(
      s.recipe.motion!.stateKeys.map((key) => [key.id, key.frame]),
    ).toEqual([
      ["loop-A", 0],
      ["loop-B", 360],
      ["loop-return-A", 720],
    ]);
    expect(s.recipe.cameraMotion!.keys[2].position).toEqual(
      s.recipe.cameraMotion!.keys[0].position,
    );
    expect(test.e.chooseMode).toHaveBeenCalledWith("shot", false);
    expect(test.events).toEqual(["configure", "render:0"]);
    expect(s.playing).toBe(true);
    expect(s.setLoop).toHaveBeenCalledWith(true);
    await act(async () =>
      setControlInput(controlInput(host, "Loop duration slider"), "193"),
    );
    expect(s.playing).toBe(false);
    expect(s.recipe.frames).toBe(721);
  });

  it("waits for apply and frame zero before capture, and waits for library persistence before reporting saved", async () => {
    const test = mountLoopDesk(),
      { host, configure, renderFrame, capture } = test;
    await savePair(test);
    let apply!: () => void, rendered!: () => void, persisted!: () => void;
    configure.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        apply = resolve;
      });
      return test.commit(...args);
    });
    renderFrame.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          rendered = resolve;
        }),
    );
    capture.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          persisted = resolve;
        }),
    );
    await act(async () => controlButton(host, "Save loop").click());
    expect(capture).not.toHaveBeenCalled();
    expect(controlButton(host, "Save loop").disabled).toBe(true);
    await act(async () => apply());
    expect(capture).not.toHaveBeenCalled();
    await act(async () => rendered());
    expect(capture).toHaveBeenCalledExactlyOnceWith("A-B-loop");
    expect(capture.mock.calls[0][0]).toMatch(WORLD_TAKE_NAME);
    expect(host.textContent).not.toContain("Saved A-B-loop in Takes");
    test.s.capturing = true;
    test.s.progress = 20;
    test.refresh();
    expect(host.textContent).toContain("20/193 frames");
    await act(async () => controlButton(host, "Save loop").click());
    expect(capture).toHaveBeenCalledOnce();
    test.s.capturing = false;
    await act(async () => persisted());
    expect(host.textContent).toContain("Saved A-B-loop in Takes");
    expect(controlButton(host, "Save loop").disabled).toBe(false);
  });

  it("preserves an intentional whole-loop camera move through loading B and can return to saved views", async () => {
    const test = mountLoopDesk(),
      { host, s } = test;
    await act(async () => controlButton(host, "Save A").click());
    test.chooseCamera(
      validateRecipe({ ...s.recipe, ...shotPatch("orbit360", s.recipe) }),
    );
    expect(host.textContent).toContain("Movement · 360");
    test.load(loopTestScene(3));
    await act(async () => controlButton(host, "Save B").click());
    await act(async () => controlButton(host, "Play loop").click());
    expect(s.recipe.cameraShot).toBe("orbit360");
    expect(s.recipe.orbit).toBe(360);
    await act(async () =>
      setControlSelect(host, "Loop camera source", "saved"),
    );
    await act(async () => controlButton(host, "Play loop").click());
    expect(s.recipe.cameraMotion!.keys).toHaveLength(3);
    expect(s.recipe.cameraMotion!.keys[0].position).toEqual(
      readLoopSlots().bank.slots[0]!.camera.position,
    );
    expect(s.recipe.cameraMotion!.keys[1].position).toEqual(
      readLoopSlots().bank.slots[1]!.camera.position,
    );
  });

  it("keeps manual Shot camera edits in their saved slots, even when the gesture creates an enabled path", async () => {
    const test = mountLoopDesk(createMotionPreset("voxel-architecture-128")),
      { host, s } = test;
    await act(async () => controlButton(host, "Save A").click());
    const before = readLoopSlots().bank.slots[0]!.camera;
    const moved = structuredClone(s.recipe);
    moved.cameraMotion = structuredClone(
      readLoopSlots().bank.slots[0]!.recipe.cameraMotion!,
    );
    moved.cameraMotion!.keys[0].position[0] += 4;
    moved.cameraMotion!.keys[0].fov = 52;
    test.load(validateRecipe(moved));
    expect(host.textContent).toContain("Movement · Saved views");
    await act(async () => controlButton(host, "Save B").click());
    expect(readLoopSlots().bank.slots[1]!.camera).not.toEqual(before);
    await act(async () => controlButton(host, "Play loop").click());
    expect(s.recipe.cameraMotion!.keys[0].position).toEqual(before.position);
    expect(s.recipe.cameraMotion!.keys[1].position).toEqual(
      moved.cameraMotion!.keys[0].position,
    );
    expect(s.recipe.cameraMotion!.keys[1].fov).toBe(52);
    expect(host.textContent).toContain("Movement · Saved views");
  });

  it("adopts the current camera path's orbit when that camera source is explicitly selected", async () => {
    const test = mountLoopDesk(),
      { host, s } = test;
    await savePair(test);
    test.load(
      validateRecipe({
        ...s.recipe,
        cameraMotion: {
          ...readLoopSlots().bank.slots[0]!.recipe.cameraMotion!,
          orbit: { axis: "z", turns: 1 },
        },
      }),
    );
    await act(async () => setControlSelect(host, "Added camera orbit", "x"));
    await act(async () =>
      setControlSelect(host, "Loop camera source", "current"),
    );
    expect(
      host.querySelector<HTMLSelectElement>(
        'select[aria-label="Added camera orbit"]',
      )!.value,
    ).toBe("z");
    await act(async () => controlButton(host, "Play loop").click());
    expect(s.recipe.cameraMotion!.orbit).toEqual({ axis: "z", turns: 1 });
  });

  it("keeps saved slots after an unsupported composition or a capture rejection", async () => {
    const test = mountLoopDesk(),
      { host, configure, capture } = test;
    await act(async () => controlButton(host, "Save A").click());
    test.load(presetRecipe("Playground"));
    await act(async () => controlButton(host, "Save B").click());
    const bank = readLoopSlots().bank;
    await act(async () => controlButton(host, "Play loop").click());
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      "same Stage or Playground",
    );
    expect(configure).not.toHaveBeenCalled();
    expect(readLoopSlots().bank).toEqual(bank);
    test.load(loopTestScene(4));
    await act(async () => controlButton(host, "Save B").click());
    capture.mockRejectedValueOnce(new Error("Capture cancelled."));
    await act(async () => controlButton(host, "Save loop").click());
    expect(host.querySelector('[role="alert"]')!.textContent).toBe(
      "Capture cancelled.",
    );
    expect(readLoopSlots().bank.slots[0]).toEqual(bank.slots[0]);
    expect(controlButton(host, "Save loop").disabled).toBe(false);
    expect(host.textContent).not.toContain("Saved A-B-loop in Takes");
  });

  it("rejects a stale view save while another asset finishes loading, and leaves A available to retry", async () => {
    const test = mountLoopDesk(),
      { host, settled } = test;
    let finish!: () => void;
    settled.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => controlButton(host, "Save A").click());
    test.load(loopTestScene(8));
    await act(async () => finish());
    expect(readLoopSlots().bank.slots[0]).toBeNull();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      "scene changed while saving",
    );
    expect(controlButton(host, "Save A").disabled).toBe(false);
    await act(async () => controlButton(host, "Save A").click());
    expect(
      readLoopSlots().bank.slots[0]!.recipe.motion!.stateKeys[0].objects.box.x,
    ).toBe(8);
  });

  it("offers C/D progressively and keeps audio routing on A–D, excluding the return key", async () => {
    const test = mountLoopDesk(),
      { host, s, configure } = test;
    await savePair(test);
    await act(async () => controlButton(host, "Add slot C").click());
    await act(async () => controlButton(host, "Save C").click());
    await act(async () => controlButton(host, "Add slot D").click());
    await act(async () => controlButton(host, "Save D").click());
    expect(host.querySelectorAll(".wb-loop-slot")).toHaveLength(4);
    expect(host.textContent).not.toContain("+ E");
    const toggle = host.querySelector<HTMLInputElement>(
      '.wb-state-audio input[type="checkbox"]',
    )!;
    await act(async () => toggle.click());
    await act(async () =>
      setControlSelect(host, "Audio band for state B", "high"),
    );
    expect(configure).not.toHaveBeenCalled();
    await act(async () => controlButton(host, "Play loop").click());
    expect(s.recipe.motion!.stateAudio!.enabled).toBe(true);
    expect(
      s.recipe.motion!.stateAudio!.routes.map((route) => route.stateId),
    ).toEqual(["loop-A", "loop-B", "loop-C", "loop-D"]);
    expect(s.recipe.motion!.stateAudio!.routes[1].source).toBe("high");
    expect(s.recipe.motion!.stateKeys.at(-1)!.id).toBe("loop-return-A");
  });
});

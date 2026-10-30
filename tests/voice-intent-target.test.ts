// A spoken request reaching the studio (issue #23): the shell opens Camera and
// the composer takes the mode, model and subject through the update its own
// controls use. Nothing submits.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composerInput,
  composerReducer,
  initialComposer,
  markEdit,
  type ComposerState,
} from "../src/useComposer";
import {
  applyVoiceIntent,
  composerIntentTarget,
  onVoiceIntent,
} from "../src/voice/voice-intent-target";
import { entryFor } from "../shared/registry";
import type { PanelId, Preset } from "../src/studio/presets";

/** A composer like `useComposer`'s: the reducer, behind `markEdit`. */
function mountComposer(start: ComposerState = initialComposer) {
  let state = start;
  const edited = { current: false };
  const update = vi.fn((patch: Partial<ComposerState>) =>
    markEdit(
      (action) => (state = composerReducer(state, action)),
      edited,
      patch,
    ),
  );
  const unmount = onVoiceIntent(composerIntentTarget(() => state, update));
  return { read: () => state, edited, update, unmount };
}
/** A shell on a section; `select` records where it went. */
function shellOn(visible: readonly PanelId[]) {
  return { visible, select: vi.fn<(preset: Preset) => void>() };
}

let unmount = () => {};
afterEach(() => unmount());

describe("a spoken request in the studio", () => {
  it("from the Gallery: opens Camera, selects Klein, writes the subject", () => {
    const composer = mountComposer();
    unmount = composer.unmount;
    expect(composer.read().generator).toBe("video");
    const gallery = shellOn([]);
    const applied = applyVoiceIntent(
      "I want to generate an image with FLUX of a penguin",
      gallery,
    );
    expect(gallery.select).toHaveBeenCalledExactlyOnceWith("camera");
    expect(applied?.entry.id).toBe("flux-3-klein");
    expect(applied?.label).toBe("FLUX 3 Image Klein · Image");
    const state = composer.read();
    expect(state.generator).toBe("image");
    expect(state.model).toBe("flux-3-klein");
    expect(state.description).toBe("a penguin");
    expect(entryFor(state.generator, state.model).id).toBe("flux-3-klein");
    // An ordinary edit: the restore effect stands aside for it.
    expect(composer.edited.current).toBe(true);
    expect(composer.update).toHaveBeenCalledTimes(1);
    // The request the priced Generate would send: Klein, the subject, a still.
    const input = composerInput(state);
    expect(input.model).toBe("flux-3-klein");
    expect(input.generator).toBe("image");
  });

  it("in Camera already: stays, and moves video to LTX-2.5 Fast", () => {
    const composer = mountComposer({
      ...initialComposer,
      generator: "image",
      model: "flux-3-klein",
    });
    unmount = composer.unmount;
    const camera = shellOn(["preview", "composer", "gallery"]);
    const applied = applyVoiceIntent(
      "make a video with LTX of a neon street at night",
      camera,
    );
    expect(camera.select).not.toHaveBeenCalled();
    expect(applied?.entry.id).toBe("ltx-2-5-fast");
    const state = composer.read();
    expect(state.generator).toBe("video");
    expect(state.model).toBe("ltx-2.5");
    expect(state.description).toBe("a neon street at night");
    // The held entry's controls fit the new model (LTX: 16:9 or 9:16).
    expect(["16:9", "9:16"]).toContain(state.aspectRatio);
  });

  it("a medium alone takes the default image model", () => {
    const composer = mountComposer();
    unmount = composer.unmount;
    applyVoiceIntent("image of a penguin", shellOn([]));
    expect(composer.read()).toMatchObject({
      generator: "image",
      model: "flux-3-klein",
      description: "a penguin",
    });
  });

  it("leaves the studio alone when the words are not a request", () => {
    const composer = mountComposer();
    unmount = composer.unmount;
    const before = composer.read();
    for (const text of [
      "open the director",
      "what time is it",
      "make a video with Klein of a cat",
    ]) {
      const shell = shellOn([]);
      expect(applyVoiceIntent(text, shell), text).toBeNull();
      expect(shell.select).not.toHaveBeenCalled();
    }
    expect(composer.read()).toBe(before);
    expect(composer.update).not.toHaveBeenCalled();
  });

  it("reads a constructor as a subject, not a crash", () => {
    const composer = mountComposer();
    unmount = composer.unmount;
    applyVoiceIntent("image of a constructor at a building site", shellOn([]));
    expect(composer.read().description).toBe(
      "a constructor at a building site",
    );
  });

  it("turns a fault in reading the words into no request", () => {
    unmount = onVoiceIntent(() => {
      throw new TypeError("broken");
    });
    const shell = shellOn([]);
    expect(applyVoiceIntent("image of a penguin", shell)).toBeNull();
    expect(shell.select).not.toHaveBeenCalled();
  });

  it("does nothing with no composer mounted", () => {
    const shell = shellOn([]);
    expect(applyVoiceIntent("image of a penguin", shell)).toBeNull();
    expect(shell.select).not.toHaveBeenCalled();
  });

  it("keeps a long subject within the prompt's limit", () => {
    const composer = mountComposer();
    unmount = composer.unmount;
    applyVoiceIntent(`a video of ${"rain ".repeat(400)}`, shellOn([]));
    expect(composer.read().description.length).toBeLessThanOrEqual(1200);
  });
});

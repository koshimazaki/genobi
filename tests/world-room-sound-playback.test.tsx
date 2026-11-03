// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { presetRecipe } from "../src/world-builder/recipe";
import { usePlaybackState } from "../src/world-builder/usePlaybackState";
import { useScenePlayback } from "../src/world-builder/useScenePlayback";
import {
  soundPreviewControls,
  soundPreviewFrames,
} from "../src/world-builder/sound-preview";
import type { WorldRuntime } from "../src/world-builder/runtime";
import type { SceneAdapter } from "../src/world-builder/scene-adapter";

function media(src: string) {
  return {
    src,
    currentTime: 0,
    ended: false,
    getAttribute: (name: string) => (name === "src" ? src : null),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  };
}

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

async function session() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const ticks = new Map<number, FrameRequestCallback>();
  let ticket = 0;
  vi.stubGlobal("requestAnimationFrame", (tick: FrameRequestCallback) => {
    ticks.set(++ticket, tick);
    return ticket;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => ticks.delete(id));
  const control = media("blob:motion-control"),
    wet = media("blob:rendered-room");
  const rendered: number[] = [];
  const lockEdits = vi.fn(),
    setMode = vi.fn(),
    setStatus = vi.fn(),
    setError = vi.fn();
  let playback!: ReturnType<typeof usePlaybackState>;
  function Harness() {
    const runtime = useRef({
      editor: { lockEdits, setMode },
    } as unknown as WorldRuntime);
    const audio = useRef(control as unknown as HTMLAudioElement);
    const queue = useRef(Promise.resolve());
    const recipe = useRef({ ...presetRecipe("Small room"), frames: 9 });
    const api = useRef({
      render: async (frame: number) => {
        rendered.push(frame);
      },
    } as unknown as SceneAdapter);
    playback = usePlaybackState(runtime, audio, queue);
    useScenePlayback({
      playing: playback.playing,
      revision: playback.revision,
      soundPreview: playback.soundPreview,
      loop: true,
      current: recipe,
      api,
      audioElement: audio,
      setPlaying: playback.setPlaying,
      setFrame: () => {},
      setError,
      setStatus,
      renders: () => true,
      active: () => playback.playingRef.current,
      held: () => false,
    });
    return null;
  }
  root = createRoot(document.createElement("div"));
  await act(() => root!.render(<Harness />));
  return {
    get playback() {
      return playback;
    },
    control,
    wet,
    rendered,
    setMode,
    setStatus,
    setError,
    async tick() {
      await act(async () => {
        const pending = [...ticks.values()];
        ticks.clear();
        pending.forEach((run) => run(performance.now()));
      });
    },
    async preview() {
      await act(() =>
        playback.sound.playSoundPreview(
          wet as unknown as HTMLAudioElement,
          0.61,
        ),
      );
    },
  };
}

describe("Room sound synchronized playback", () => {
  it("refuses a new sound preview while capture or scene loading owns the renderer", () => {
    const playing = vi.fn();
    const control = soundPreviewControls(
      { current: null },
      { current: {} as WorldRuntime },
      playing,
      () => false,
    );
    expect(() =>
      control.playSoundPreview(
        media("blob:room") as unknown as HTMLAudioElement,
        1,
      ),
    ).toThrow(/current scene operation/);
    expect(playing).not.toHaveBeenCalled();
  });
  it("uses the sound clock, holds the last picture for decay and never loops the tail", async () => {
    const s = await session();
    expect(soundPreviewFrames(9, 0.61)).toBe(15);
    await s.preview();
    expect(s.wet.play).toHaveBeenCalledTimes(1);
    expect(s.control.play).not.toHaveBeenCalled();
    expect(s.setMode).toHaveBeenCalledWith("shot", false);
    // Audio that has not started or has stalled also holds the picture.
    await s.tick();
    expect(s.rendered.at(-1)).toBe(0);
    s.wet.currentTime = 0.2;
    await s.tick();
    expect(s.rendered.at(-1)).toBe(4);
    s.wet.currentTime = 0.5;
    await s.tick();
    expect(s.rendered.at(-1)).toBe(8);
    expect(s.playback.playing).toBe(true);
    s.wet.currentTime = 0.61;
    s.wet.ended = true;
    await s.tick();
    expect(s.playback.playing).toBe(false);
    expect(s.rendered.at(-1)).toBe(8);
    expect(s.wet.play).toHaveBeenCalledTimes(1);
    expect(s.wet.pause).toHaveBeenCalled();
    expect(s.control.src).toBe("blob:motion-control");
    expect(s.setError).not.toHaveBeenCalled();
  });

  it("restarts on batched stop/play, stops before capture and restores ordinary control playback", async () => {
    const s = await session();
    await act(() => s.playback.setPlaying(true));
    expect(s.control.play).toHaveBeenCalledTimes(1);
    await s.preview();
    expect(s.wet.play).toHaveBeenCalledTimes(1);
    expect(s.playback.soundPreview.current?.element).toBe(s.wet);
    await act(async () => {
      await s.playback.stopping(async () => {
        expect(s.playback.playingRef.current).toBe(false);
        expect(s.wet.pause).toHaveBeenCalled();
        expect(s.playback.soundPreview.current).toBeNull();
      })();
    });
    const last = s.rendered.length;
    await s.tick();
    expect(s.rendered).toHaveLength(last);
    await act(() => s.playback.setPlaying(true));
    expect(s.control.play).toHaveBeenCalledTimes(2);
    expect(s.wet.play).toHaveBeenCalledTimes(1);
  });

  it("stops the shared preview cleanly when the rendered audio cannot play", async () => {
    const s = await session();
    s.wet.play.mockRejectedValueOnce(
      new DOMException("Blocked", "NotAllowedError"),
    );
    await s.preview();
    expect(s.playback.playing).toBe(false);
    expect(s.playback.soundPreview.current).toBeNull();
    expect(s.setStatus).toHaveBeenCalledWith(
      "Room sound could not start; press Preview again.",
    );
    expect(s.control.play).not.toHaveBeenCalled();
  });
});

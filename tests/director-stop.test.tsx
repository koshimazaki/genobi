// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDirectorTransport } from "../src/director/useDirectorTransport";
import type { useDirectorRuntime } from "../src/director/useDirectorRuntime";
import type { Playback } from "../src/director/playback";
import { studioStore } from "../src/studio/store";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  studioStore.getState().actions.operations({ playing: false });
});

it("Stop during playback pauses and returns to frame 0", async () => {
  const rendered: number[] = [];
  let cancelled = false;
  let stop: (() => Promise<void>) | undefined;
  function Harness() {
    const runtime = useRef({
      render: async (f: number) => {
        rendered.push(f);
      },
    });
    const playback = useRef<Playback | null>({
      cancel: () => {
        cancelled = true;
      },
      done: Promise.resolve(),
    });
    const t = useDirectorTransport(
      {
        runtime,
        playback,
        abort: { current: null },
        ready: true,
        setStatus: () => {},
        setError: () => {},
        report: (e: unknown) => {
          throw e;
        },
        setRenderUrl: () => {},
        setRenderSummary: () => {},
      } as unknown as ReturnType<typeof useDirectorRuntime>,
      undefined,
    );
    stop = t.stop;
    return null;
  }
  studioStore.getState().actions.transport({ frame: 75 });
  studioStore.getState().actions.operations({ playing: true });
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
  await act(async () => {
    await stop!();
  });
  expect(cancelled).toBe(true);
  expect(studioStore.getState().operations.playing).toBe(false);
  expect(studioStore.getState().transport.frame).toBe(0);
  expect(rendered).toEqual([0]);
});

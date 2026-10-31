// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeAudio } from "../src/world-builder/audio";
import { renderDynamicRoomAudio } from "../src/world-builder/dynamic-room-audio";
import {
  useRoomSound,
  type RoomSound,
} from "../src/world-builder/useRoomSound";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import {
  shortRoomRecipe,
  renderedRoomFixture,
} from "./world-room-sound-fixture";

vi.mock("../src/world-builder/audio", async (original) => ({
  ...(await original<typeof import("../src/world-builder/audio")>()),
  decodeAudio: vi.fn(),
}));
vi.mock("../src/world-builder/dynamic-room-audio", async (original) => ({
  ...(await original<
    typeof import("../src/world-builder/dynamic-room-audio")
  >()),
  renderDynamicRoomAudio: vi.fn(),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const createURL = vi.fn(() => "blob:room-test"),
  revokeURL = vi.fn();
const pcm = (): Awaited<ReturnType<typeof decodeAudio>> => ({
  channels: [new Float32Array(3000).fill(0.05)],
  sampleRate: 8000,
  envelope: [0.8],
  bands: { sub: [0.1], low: [0.4], mid: [0.3], high: [0.2] },
});
const file = (name: string) =>
  Object.assign(new NodeBlob([name], { type: "audio/wav" }), {
    name,
  }) as unknown as File;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createURL;
      static revokeObjectURL = revokeURL;
    },
  );
  vi.mocked(decodeAudio).mockImplementation(async () => pcm());
  vi.mocked(renderDynamicRoomAudio).mockImplementation(
    async (input, schedule) => renderedRoomFixture(input, schedule),
  );
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mounted() {
  let sound!: RoomSound,
    revision = 0;
  const recipe = shortRoomRecipe();
  const control = pcm();
  const session = {
    recipe,
    ready: true,
    busy: false,
    capturing: false,
    playing: false,
    frame: 0,
    track: { current: control },
    audioName: "Control music",
    audioURL: "blob:control",
    api: {
      current: {
        getRecipe: () => structuredClone(session.recipe),
        getRecipeRevision: () => `scene:${revision}`,
      },
    },
    setPlaying: vi.fn(),
    settled: vi.fn(async () => {}),
    runtime: { current: { editor: { setMode: vi.fn() } } },
    playSoundPreview: vi.fn(),
    stopSoundPreview: vi.fn(),
  } as unknown as BuilderSession;
  function Harness() {
    sound = useRoomSound(session);
    return <audio ref={sound.audio} src={sound.url || undefined} />;
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  const redraw = () => act(() => root!.render(<Harness />));
  redraw();
  return {
    sound: () => sound,
    session,
    control,
    edit: () => {
      session.recipe = { ...session.recipe, light: session.recipe.light + 0.1 };
      revision++;
      redraw();
    },
    reviseOnly: () => {
      revision++;
    },
  };
}

it("requires explicit control-copy and keeps its PCM/envelopes independent", async () => {
  const h = mounted();
  expect(h.sound().source).toBeNull();
  const recipeBefore = structuredClone(h.session.recipe);
  await act(async () => h.sound().useControl());
  expect(h.sound().source?.origin).toBe("control-copy");
  expect(h.sound().source?.track.channels[0]).not.toBe(h.control.channels[0]);
  expect(h.sound().source?.track.envelope).toEqual([]);
  await act(async () => h.sound().render());
  expect(h.sound().output).not.toBeNull();
  expect(h.session.track.current).toBe(h.control);
  expect(h.session.audioURL).toBe("blob:control");
  expect(h.session.recipe).toEqual(recipeBefore);
});

it("discards late results after an editor change, including an imperative revision before React updates", async () => {
  for (const beforeReact of [false, true]) {
    const h = mounted();
    await act(async () => h.sound().testImpulses());
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(renderDynamicRoomAudio).mockImplementationOnce(
      async (input, schedule) => {
        await wait;
        return renderedRoomFixture(input, schedule);
      },
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = h.sound().render();
      await Promise.resolve();
    });
    if (beforeReact) h.reviseOnly();
    else h.edit();
    await act(async () => {
      release();
      await pending;
    });
    expect(h.sound().output).toBeNull();
    expect(createURL).not.toHaveBeenCalled();
    act(() => root!.unmount());
    root = null;
  }
});

it.each(["mix", "source", "cancel"])(
  "invalidates an in-flight render when %s changes",
  async (kind) => {
    const h = mounted();
    await act(async () => h.sound().testImpulses());
    let release!: () => void, signal!: AbortSignal;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(renderDynamicRoomAudio).mockImplementationOnce(
      async (input, schedule, options) => {
        signal = options!.signal!;
        await wait;
        return renderedRoomFixture(input, schedule);
      },
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = h.sound().render();
      await Promise.resolve();
    });
    await act(async () => {
      if (kind === "mix") h.sound().changeSettings({ wet: 0.7 });
      else if (kind === "source") await h.sound().loadFile(file("new.wav"));
      else h.sound().cancel();
    });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      release();
      await pending;
    });
    expect(h.sound().output).toBeNull();
  },
);

it("ignores a late previous upload and revokes result URLs after invalidation", async () => {
  const h = mounted();
  let release!: (value: ReturnType<typeof pcm>) => void;
  vi.mocked(decodeAudio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  let first!: Promise<void>;
  await act(async () => {
    first = h.sound().loadFile(file("old.wav"));
    await Promise.resolve();
  });
  await act(async () => h.sound().loadFile(file("new.wav")));
  await act(async () => {
    release(pcm());
    await first;
  });
  expect(h.sound().source?.label).toBe("new.wav");
  await act(async () => h.sound().render());
  expect(createURL).toHaveBeenCalledOnce();
  h.edit();
  expect(revokeURL).toHaveBeenCalledWith("blob:room-test");
  expect(h.sound().output).toBeNull();
});

it("uses the guarded session preview and reports a refused preview without an unhandled rejection", async () => {
  const h = mounted();
  await act(async () => {
    await h.sound().testImpulses();
  });
  await act(async () => h.sound().render());
  await act(async () => h.sound().preview());
  expect(h.session.setPlaying).toHaveBeenCalledWith(false);
  expect(h.session.playSoundPreview).toHaveBeenCalledWith(
    expect.any(HTMLAudioElement),
    h.sound().output!.duration,
  );
  vi.mocked(h.session.playSoundPreview).mockImplementationOnce(() => {
    throw new Error("Capture owns the scene.");
  });
  await act(async () => h.sound().preview());
  expect(h.sound().error).toContain("Capture owns the scene");
});

it("aborts on unmount and never publishes a late output URL", async () => {
  const h = mounted();
  await act(async () => h.sound().testImpulses());
  let release!: () => void, signal!: AbortSignal;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(renderDynamicRoomAudio).mockImplementationOnce(
    async (input, schedule, options) => {
      signal = options!.signal!;
      await wait;
      return renderedRoomFixture(input, schedule);
    },
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = h.sound().render();
    await Promise.resolve();
  });
  act(() => root!.unmount());
  root = null;
  expect(signal.aborted).toBe(true);
  await act(async () => {
    release();
    await pending;
  });
  expect(createURL).not.toHaveBeenCalled();
});

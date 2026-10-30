// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import studio from "../docs/director-bundle/example/studio.json";
import type { Bundle } from "../src/director/bundle";
import type { Project } from "../shared/director/types";
import { openVideo } from "../src/director/video-source";
import { DirectorRenderer } from "../src/director/renderer";

vi.mock("../src/director/recipes", () => ({ recipes: [], libraries: {} }));
vi.mock("../src/director/font-registry", () => ({
  preloadBundledFonts: async () => {},
  fontRequest: () => undefined,
}));
vi.mock("../src/director/filter-host", () => ({
  FilterHost: class {
    dispose = vi.fn();
  },
}));
vi.mock("../src/director/video-source", () => ({ openVideo: vi.fn() }));

function setup() {
  const project = structuredClone(studio) as Project;
  const bundle: Bundle = {
    project,
    files: new Map(
      Object.values(project.assets).map((a) => [
        a.file.path,
        new Uint8Array(4),
      ]),
    ),
  };
  const layer = bundle.project.layers.find((l) => l.kind === "video")!;
  bundle.project = {
    ...bundle.project,
    modules: {},
    layers: [layer, { ...layer, id: "second-cut" }],
  };
  const close = vi.fn(async () => {});
  vi.stubGlobal(
    "AudioContext",
    class {
      close = close;
    },
  );
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  const objectUrl = vi.fn(() => "blob:unused");
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, { createObjectURL: objectUrl }),
  );
  const renderer = new DirectorRenderer(
    bundle,
    document.createElement("canvas"),
  );
  return { renderer, close, objectUrl };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("opens one decoder for repeated cuts and creates no unused video blobs", async () => {
  const { renderer, close, objectUrl } = setup();
  const dispose = vi.fn();
  vi.mocked(openVideo).mockResolvedValue({
    duration: 999,
    dispose,
    at: vi.fn(),
  });
  await renderer.init();
  expect(openVideo).toHaveBeenCalledTimes(1);
  expect(objectUrl).not.toHaveBeenCalled();
  renderer.dispose();
  renderer.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(renderer.composite.width).toBe(1);
});

it("releases a decoder that finishes opening after its preview was closed", async () => {
  const { renderer, close } = setup();
  let finish!: (video: Awaited<ReturnType<typeof openVideo>>) => void;
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  vi.mocked(openVideo).mockImplementation(() => {
    signalStarted();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const initialization = renderer.init();
  await started;
  renderer.dispose();
  expect(close).toHaveBeenCalledOnce();
  const dispose = vi.fn();
  finish({ duration: 999, dispose, at: vi.fn() });
  await expect(initialization).rejects.toMatchObject({ name: "AbortError" });
  expect(dispose).toHaveBeenCalledOnce();
  expect(openVideo).toHaveBeenCalledOnce();
});

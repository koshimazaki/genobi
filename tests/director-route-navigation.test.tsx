// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import studio from "../docs/director-bundle/example/studio.json";
import type { Project } from "../shared/director/types";
import { studioStore } from "../src/studio/store";
import { useStudio } from "../src/studio/useStudio";
import { useDirectorRuntime } from "../src/director/useDirectorRuntime";
import { useDirectorTransport } from "../src/director/useDirectorTransport";
import { exportMp4 } from "../src/director/export";
import type { Bundle } from "../src/director/bundle";
import { loadMixTemplate } from "../src/director/mix-template";
import { loadShowcase } from "../src/director/showcase";
import {
  go,
  editorLink,
  takeToEditor,
} from "../src/template-gallery/template-actions";
import { openShowcase } from "../src/template-gallery/open-showcase";
import { findMixTemplate } from "../shared/templates/catalogue";
import { showcaseLink } from "../shared/showcase/types";
import { initialPreset } from "../src/studio/presets";

vi.mock("../src/director/useProjectCopy", () => ({ useProjectCopy: () => {} }));
vi.mock("../src/director/renderer", () => ({
  DirectorRenderer: class {
    constructor(public bundle: Bundle) {}
    init = async () => {};
    render = async () => {};
    dispose = () => {};
    waveforms = () => ({});
  },
}));
vi.mock("../src/director/export", () => ({ exportMp4: vi.fn() }));
vi.mock("../src/director/mix-template", () => ({ loadMixTemplate: vi.fn() }));
vi.mock("../src/director/showcase", async (original) => ({
  ...(await original<typeof import("../src/director/showcase")>()),
  loadShowcase: vi.fn(),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
function bundle(id: string) {
  const b = {
    project: structuredClone(studio) as unknown as Project,
    files: new Map<string, Uint8Array<ArrayBuffer>>(),
  };
  b.project.id = id;
  return b;
}
beforeEach(() => {
  history.replaceState(null, "", "/");
  studioStore.setState({ director: { history: [], drafts: {} } });
  studioStore.getState().actions.operations({
    playing: false,
    rendering: false,
    workingFile: false,
  });
  vi.mocked(loadMixTemplate).mockImplementation(async (t) => bundle(t.id));
  vi.mocked(loadShowcase).mockImplementation(async (id, version) => ({
    bundle: bundle(`${id}-v${version}`),
    note: "",
  }));
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function mount(withCanvas = false) {
  function Harness() {
    const current = useStudio((s) => s.director.bundle);
    const runtime = useDirectorRuntime(current, false);
    const transport = useDirectorTransport(runtime, current);
    return (
      <>
        {withCanvas && <canvas ref={runtime.canvas} />}
        <button onClick={() => void transport.exportVideo()}>Export</button>
        <p>{runtime.error}</p>
        <output>{runtime.renderUrl}</output>
      </>
    );
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(<Harness />));
}

it("loads Dimensions mix on a fresh shared runtime", async () => {
  await mount();
  expect(studioStore.getState().director.bundle!.project.id).toBe(
    "dimensions-mix",
  );
});

it("honours an editor template URL after the Director is already mounted, including back navigation", async () => {
  await mount();
  await act(async () => go(editorLink("bloom-teaser")));
  expect(initialPreset(location.pathname, location.search)).toBe("editor");
  expect(studioStore.getState().director.bundle!.project.id).toBe(
    "bloom-teaser",
  );
  expect(
    studioStore.getState().director.drafts["dimensions-mix"],
  ).toBeDefined();
  await act(async () => go(editorLink("adaptive-reverb")));
  // Popstate after history Back reads the URL, even though the owner stays mounted.
  await act(async () => {
    history.replaceState(null, "", editorLink("bloom-teaser"));
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(studioStore.getState().director.bundle!.project.id).toBe(
    "bloom-teaser",
  );
});

it("Take it to the editor opens the real mix before navigating and does not reload it", async () => {
  await mount();
  vi.mocked(loadMixTemplate).mockClear();
  await act(async () => takeToEditor(findMixTemplate("bloom-teaser")!));
  expect(location.search).toBe("?example=bloom-teaser&workspace=editor");
  expect(studioStore.getState().director.bundle!.project.id).toBe(
    "bloom-teaser",
  );
  expect(loadMixTemplate).toHaveBeenCalledTimes(1);
});

it("opens a showcase version in the mounted Editor, from either its URL or its drawer action", async () => {
  await mount();
  await act(async () => go(showcaseLink("bloom-teaser", 1)));
  expect(studioStore.getState().director.bundle!.project.id).toBe(
    "bloom-teaser-v1",
  );
  await act(async () => openShowcase("adaptive-reverb", 2));
  expect(initialPreset(location.pathname, location.search)).toBe("editor");
  expect(studioStore.getState().director.bundle!.project.id).toBe(
    "adaptive-reverb-v2",
  );
});

it("does not overwrite work with an earlier template load that finishes late", async () => {
  let resolve!: (b: ReturnType<typeof bundle>) => void;
  vi.mocked(loadMixTemplate).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount();
  await act(async () => go(editorLink("bloom-teaser")));
  await act(async () => resolve(bundle("dimensions-mix")));
  expect(studioStore.getState().director.bundle!.project.id).toBe(
    "bloom-teaser",
  );
});

it("refuses a slow route load if an export started meanwhile, without aborting it", async () => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:export");
      static revokeObjectURL = vi.fn();
    },
  );
  await mount(true);
  const before = studioStore.getState().director.bundle;
  let finishLoad!: (b: Bundle) => void;
  vi.mocked(loadMixTemplate).mockImplementationOnce(
    () =>
      new Promise((done) => {
        finishLoad = done;
      }),
  );
  await act(async () => go(editorLink("bloom-teaser")));
  expect(loadMixTemplate).toHaveBeenLastCalledWith(
    findMixTemplate("bloom-teaser"),
  );

  let finishExport!: (blob: Blob) => void;
  vi.mocked(exportMp4).mockImplementationOnce(
    () =>
      new Promise((done) => {
        finishExport = done;
      }),
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(exportMp4).toHaveBeenCalledOnce();
  const signal = vi.mocked(exportMp4).mock.calls[0][2];
  expect(studioStore.getState().operations.rendering).toBe(true);

  await act(async () => finishLoad(bundle("bloom-teaser")));
  expect(studioStore.getState().director.bundle).toBe(before);
  expect(signal.aborted).toBe(false);
  expect(document.querySelector("p")!.textContent).toContain(
    "Wait for playback, import or export to finish first.",
  );

  await act(async () => finishExport(new Blob(["mp4"])));
  expect(document.querySelector("output")!.textContent).toBe("blob:export");
  expect(studioStore.getState().operations.rendering).toBe(false);
});

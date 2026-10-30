// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import studio from "../docs/director-bundle/example/studio.json";
import type { Project } from "../shared/director/types";
import type { Bundle } from "../src/director/bundle";
import { studioStore } from "../src/studio/store";
import { StudioPanel, useShell } from "../src/studio/ShellContext";
import StudioShell from "../src/studio/StudioShell";
import { loadMixTemplate } from "../src/director/mix-template";
import { play } from "../src/director/playback";

// Keep the real shell, Director, runtime, transport and keyboard handlers.
// Stand in for unrelated panel contents, media decoding and the audio clock.
vi.mock("../src/App", () => ({
  default: () => (
    <StudioPanel id="header">{useShell()?.navigation}</StudioPanel>
  ),
}));
vi.mock("../src/template-gallery/TemplateGallery", () => ({
  default: () => null,
}));
vi.mock("../src/scrolls/Scrolls", () => ({ default: () => null }));
vi.mock("../src/dual-editor/useEditorAssets", () => ({
  useEditorAssets: () => ({ assets: [] }),
}));
vi.mock("../src/usePageKey", () => ({ usePageKey: () => ({}) }));
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
vi.mock("../src/director/playback", () => ({
  play: vi.fn(() => {
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { done, cancel: vi.fn(() => finish()) };
  }),
}));
vi.mock("../src/director/mix-template", () => ({
  loadMixTemplate: vi.fn(async (t: { id: string }) => ({
    project: { ...structuredClone(studio), id: t.id } as unknown as Project,
    files: new Map(),
  })),
}));
vi.mock("../src/memory/ProjectMemoryPanel", () => ({ default: () => null }));
vi.mock("../src/studio/ProjectShelf", () => ({ ProjectShelf: () => null }));
vi.mock("../src/director/ProjectAssetDrawer", () => ({ default: () => null }));
vi.mock("../src/director/SavedVideos", () => ({ default: () => null }));
vi.mock("../src/director/ComposerHeader", () => ({ default: () => null }));
vi.mock("../src/director/CopyConflictQuestion", () => ({
  default: () => null,
}));
vi.mock("../src/director/ProgramRow", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../src/director/RemixPanel", () => ({
  default: () => (
    <StudioPanel id="tools">
      <button>Workflow tools</button>
    </StudioPanel>
  ),
}));
vi.mock("../src/director/DirectorConsole", () => ({
  default: ({ togglePlay }: { togglePlay: () => Promise<void> }) => (
    <button data-play onClick={() => void togglePlay()}>
      Play
    </button>
  ),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
beforeEach(() => {
  history.replaceState(null, "", "/?workspace=tools");
  localStorage.clear();
  studioStore.setState({ director: { history: [], drafts: {} } });
  studioStore.getState().actions.workspace({
    advanced: false,
    selected: "title",
    drawerOpen: false,
    addTrackOpen: false,
  });
  studioStore.getState().actions.operations({
    workingFile: false,
    rendering: false,
    playing: false,
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(<StudioShell />));
  await act(async () => vi.dynamicImportSettled());
}
async function select(preset: string) {
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(`[data-preset-button="${preset}"]`)!
      .click(),
  );
}
async function key(target: Element, value: string, code = value) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    code,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => target.dispatchEvent(event));
  return event;
}

it("initializes Tools without letting Space or Delete control the hidden timeline", async () => {
  await mount();
  expect(loadMixTemplate).toHaveBeenCalledOnce();
  const before = studioStore.getState().director.bundle;
  expect(before?.project.id).toBe("dimensions-mix");
  const tools = document.querySelector<HTMLButtonElement>(
    '[data-panel="tools"] button',
  )!;
  expect(tools.textContent).toBe("Workflow tools");
  tools.focus();
  const space = await key(tools, " ", "Space");
  expect(space.defaultPrevented).toBe(false);
  expect(play).not.toHaveBeenCalled();
  const up = new KeyboardEvent("keyup", {
    key: " ",
    code: "Space",
    bubbles: true,
    cancelable: true,
  });
  tools.dispatchEvent(up);
  expect(up.defaultPrevented).toBe(false);
  expect((await key(tools, "Delete")).defaultPrevented).toBe(false);
  expect((await key(document.body, "Delete")).defaultPrevented).toBe(false);
  expect(studioStore.getState().director.bundle).toBe(before);
  expect(studioStore.getState().operations.playing).toBe(false);
  // Reactivating the timeline enables its keys again.
  await select("editor");
  const timeline = document.querySelector('[data-panel="timeline"] button')!;
  expect((await key(timeline, "Delete")).defaultPrevented).toBe(true);
  expect(
    studioStore
      .getState()
      .director.bundle!.project.layers.some((l) => l.id === "title"),
  ).toBe(false);
});

it("pauses a playing Editor when switching to Tools, retaining the open project", async () => {
  history.replaceState(null, "", "/?workspace=editor");
  await mount();
  const before = studioStore.getState().director.bundle;
  const timeline = document.querySelector('[data-panel="timeline"] button')!;
  expect((await key(timeline, " ", "Space")).defaultPrevented).toBe(true);
  expect(play).toHaveBeenCalledOnce();
  const playback = vi.mocked(play).mock.results[0].value;
  expect(studioStore.getState().operations.playing).toBe(true);
  await select("tools");
  expect(playback.cancel).toHaveBeenCalledOnce();
  expect(studioStore.getState().operations.playing).toBe(false);
  expect(studioStore.getState().director.bundle).toBe(before);
  expect(loadMixTemplate).toHaveBeenCalledOnce();
});

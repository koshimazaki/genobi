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
async function key(
  target: Element,
  value: string,
  code = value,
  extra: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    code,
    bubbles: true,
    cancelable: true,
    ...extra,
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

it("opens the Editor with its Assets rail closed and keeps a hidden rail across a reload", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  history.replaceState(null, "", "/?workspace=editor");
  await mount();
  const workspace = () => document.querySelector(".studio-workspace")!;
  // Docked width, yet the Editor waits to be asked for its rail.
  expect(workspace().hasAttribute("data-assets-open")).toBe(false);
  await select("camera");
  expect(workspace().hasAttribute("data-assets-open")).toBe(true);
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Hide assets"]')!
      .click(),
  );
  expect(workspace().hasAttribute("data-assets-open")).toBe(false);
  expect(JSON.parse(localStorage.getItem("genobi.ninja-rails.v1")!)).toEqual({
    camera: false,
  });
  // A reload keeps the choice instead of reopening the rail.
  act(() => root!.unmount());
  history.replaceState(null, "", "/?workspace=camera");
  await mount();
  expect(workspace().hasAttribute("data-assets-open")).toBe(false);
});

it("drops a project media request left open when the workspace changes", async () => {
  history.replaceState(null, "", "/?workspace=director");
  await mount();
  act(() => studioStore.getState().actions.workspace({ drawerOpen: true }));
  await select("editor");
  expect(studioStore.getState().workspace.drawerOpen).toBe(false);
  // A caller that switches and then asks for it still gets it.
  act(() => studioStore.getState().actions.workspace({ drawerOpen: true }));
  expect(studioStore.getState().workspace.drawerOpen).toBe(true);
});

it("undoes the last Editor edit with Cmd/Ctrl+Z outside text, with no redo", async () => {
  history.replaceState(null, "", "/?workspace=editor");
  await mount();
  const timeline = document.querySelector('[data-panel="timeline"] button')!;
  const hasTitle = () =>
    studioStore
      .getState()
      .director.bundle!.project.layers.some((l) => l.id === "title");
  expect((await key(timeline, "Delete")).defaultPrevented).toBe(true);
  expect(hasTitle()).toBe(false);
  // Shift+Cmd+Z would be redo, which does not exist: left alone.
  const redo = await key(timeline, "z", "KeyZ", {
    metaKey: true,
    shiftKey: true,
  });
  expect(redo.defaultPrevented).toBe(false);
  expect(hasTitle()).toBe(false);
  expect(
    (await key(timeline, "z", "KeyZ", { ctrlKey: true })).defaultPrevented,
  ).toBe(true);
  expect(hasTitle()).toBe(true);
  // Nothing left to undo: the key goes back to the browser.
  expect(
    (await key(timeline, "z", "KeyZ", { metaKey: true })).defaultPrevented,
  ).toBe(false);
});

it("opens Director on its editable timeline, with no panel over it", async () => {
  await mount();
  await select("director");
  const panel = document.querySelector<HTMLElement>('[data-panel="timeline"]')!;
  expect(panel.hidden).toBe(false);
  expect(panel.querySelector("[data-play]")?.textContent).toBe("Play");
  expect(document.querySelector("dialog[open]")).toBeNull();
});

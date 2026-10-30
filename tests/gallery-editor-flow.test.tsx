// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import studio from "../docs/director-bundle/example/studio.json";
import type { Project } from "../shared/director/types";
import { mixTemplates } from "../shared/templates/catalogue";
import { studioStore } from "../src/studio/store";
import { useStudio } from "../src/studio/useStudio";
import { StudioPanel, useShell } from "../src/studio/ShellContext";
import StudioShell from "../src/studio/StudioShell";
import { useDirectorRuntime } from "../src/director/useDirectorRuntime";
import { loadMixTemplate } from "../src/director/mix-template";

// Keep the real shell, gallery, drawer, actions, store and URL navigation.
// Media loaders stand in for network/decoders, which jsdom cannot run.
vi.mock("../src/App", () => ({
  default: () => (
    <StudioPanel id="header">{useShell()?.navigation}</StudioPanel>
  ),
}));
vi.mock("../src/scrolls/Scrolls", () => ({ default: () => null }));
vi.mock("../src/director/useProjectCopy", () => ({ useProjectCopy: () => {} }));
vi.mock("../src/director/renderer", () => ({ DirectorRenderer: class {} }));
vi.mock("../src/director/Director", () => ({
  default: ({
    active,
    initializeProject,
  }: {
    active: boolean;
    initializeProject: boolean;
  }) => {
    const state = useStudio((s) => s);
    useDirectorRuntime(state.director.bundle, active, initializeProject);
    return (
      <>
        <StudioPanel id="stage">
          <output
            data-open-project={state.director.bundle?.project.id}
            data-editor={state.workspace.advanced}
          />
        </StudioPanel>
        {state.director.bundle && (
          <StudioPanel id="tools">
            <p>Project tools ready</p>
          </StudioPanel>
        )}
      </>
    );
  },
}));
vi.mock("../src/director/mix-template", () => ({
  loadMixTemplate: vi.fn(async (t: { id: string }) => ({
    project: { ...structuredClone(studio), id: t.id } as unknown as Project,
    files: new Map(),
  })),
}));
vi.mock("../src/director/showcase", async (original) => ({
  ...(await original<typeof import("../src/director/showcase")>()),
  loadShowcase: async (id: string, version: number) => ({
    bundle: {
      project: {
        ...structuredClone(studio),
        id: `${id}-v${version}`,
      } as unknown as Project,
      files: new Map(),
    },
    note: "",
  }),
}));
vi.mock("../src/dual-editor/useEditorAssets", () => ({
  useEditorAssets: () => ({ assets: [] }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
beforeEach(() => {
  history.replaceState(null, "", "/");
  localStorage.clear();
  studioStore.setState({ director: { history: [], drafts: {} } });
  studioStore.getState().actions.workspace({ advanced: false });
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
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each(["/?workspace=tools", "/"])(
  "initializes Project Tools on a fresh visit from %s, deferring media on Gallery",
  async (url) => {
    history.replaceState(null, "", url);
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(<StudioShell />));
    if (url === "/") {
      expect(loadMixTemplate).not.toHaveBeenCalled();
      expect(studioStore.getState().director.bundle).toBeUndefined();
      await act(async () =>
        document
          .querySelector<HTMLButtonElement>('[data-preset-button="tools"]')!
          .click(),
      );
    }
    expect(loadMixTemplate).toHaveBeenCalledOnce();
    expect(studioStore.getState().director.bundle?.project.id).toBe(
      "dimensions-mix",
    );
    expect(
      document.querySelector('[data-panel="tools"]')!.textContent,
    ).toContain("Project tools ready");
  },
);
async function drawer(name: string) {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(<StudioShell />));
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="View ${name}"]`,
  )!;
  expect(button).not.toBeNull();
  await act(async () => button.click());
  return document.querySelector<HTMLElement>('[role="dialog"]')!;
}
function assertEditor(id: string) {
  expect(
    document.querySelector<HTMLElement>(".genobi-shell")!.dataset.preset,
  ).toBe("editor");
  expect(studioStore.getState().workspace.advanced).toBe(true);
  expect(
    document
      .querySelector("[data-open-project]")!
      .getAttribute("data-open-project"),
  ).toBe(id);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector<HTMLElement>(".genobi-grid")!.inert).not.toBe(
    true,
  );
}

it.each(mixTemplates)(
  "Gallery → $name → Take it to the editor opens the right project and workspace",
  async (t) => {
    const panel = await drawer(t.name);
    const link = [...panel.querySelectorAll("a")].find(
      (a) => a.textContent === "Take it to the editor",
    )!;
    await act(async () => {
      link.click();
      await vi.waitFor(() =>
        expect(location.search).toBe(`?example=${t.id}&workspace=editor`),
      );
    });
    assertEditor(t.id);
  },
);

it("Gallery → Bloom → Open v1 in the editor switches the shell and opens that version", async () => {
  const panel = await drawer("Bloom");
  const link = [...panel.querySelectorAll("a")].find(
    (a) => a.textContent === "Open v1 in the editor",
  )!;
  await act(async () => {
    link.click();
    await vi.waitFor(() =>
      expect(location.search).toBe(
        "?showcase=bloom-teaser&version=1&workspace=editor",
      ),
    );
  });
  assertEditor("bloom-teaser-v1");
});

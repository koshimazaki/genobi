// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import studio from "../docs/director-bundle/example/studio.json";
import type { Project } from "../shared/director/types";
import { createStudioStore, studioStore } from "../src/studio/store";
import { PROJECT_ASSET_DRAG } from "../src/director/asset-drag";
import { useTimelineDrop } from "../src/director/useTimelineDrop";
import {
  REVEAL_MS,
  addedLayers,
  announceDrop,
  onDrop,
  revealDroppedClip,
  revealPixels,
  useDropReveal,
} from "../src/director/drop-reveal";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const bundle = () => ({
  project: structuredClone(studio) as unknown as Project,
  files: new Map(),
});
// The frame after a drop: the timeline has rendered the new clip by then.
let frames: (() => void)[] = [];
function nextFrames() {
  while (frames.length) frames.shift()!();
}
let root: Root | undefined;
beforeEach(() => {
  studioStore.setState({ director: { history: [], drafts: {} } });
  studioStore.getState().actions.initialize(bundle());
  studioStore.getState().actions.workspace({ selected: "title" });
  studioStore.getState().actions.settings({ zoom: 90, fit: false });
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => {
    frames.push(run);
    return frames.length;
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("doubles the pixels per frame within the manual range", () => {
  expect(revealPixels(3)).toBe(6);
  expect(revealPixels(0.4)).toBe(2);
  expect(revealPixels(9)).toBe(12);
  expect(revealPixels(12)).toBe(12);
});

it("selects the dropped clip and leaves Fit all for a doubled zoom", () => {
  const store = createStudioStore();
  store.getState().actions.initialize(bundle());
  store.getState().actions.settings({ fit: true });
  revealDroppedClip(store, "video-a", 1.5);
  expect(store.getState().workspace.selected).toBe("video-a");
  expect(store.getState().settings).toMatchObject({ zoom: 3 * 30, fit: false });
});

it("names only the layers an edit added, and tells listeners once", () => {
  expect(
    addedLayers(
      { layers: [{ id: "a" }, { id: "b" }] },
      { layers: [{ id: "a" }, { id: "c" }, { id: "b" }] },
    ),
  ).toEqual(["c"]);
  const heard: string[] = [];
  const stop = onDrop((id) => heard.push(id));
  announceDrop(undefined);
  announceDrop("c");
  stop();
  announceDrop("d");
  expect(heard).toEqual(["c"]);
});

it("reveals an asset dropped on the timeline: selected, zoomed, in view, marked", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let drop!: ReturnType<typeof useTimelineDrop>;
  function Probe() {
    drop = useTimelineDrop({ disabled: false, frame: 12, drop: () => {} });
    useDropReveal(studioStore, 3);
    const layers = studioStore.getState().director.bundle!.project.layers;
    return (
      <div className="dir-timeline">
        {layers.map((l) => (
          <div key={l.id} data-layer-id={l.id} />
        ))}
      </div>
    );
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(<Probe />));
  const before = studioStore.getState().director.bundle!;
  const data = new Map([
    [
      PROJECT_ASSET_DRAG,
      JSON.stringify({
        projectId: before.project.id,
        assetId: "video",
        sha256: before.project.assets.video.file.sha256,
      }),
    ],
  ]);
  const event = {
    dataTransfer: {
      types: [PROJECT_ASSET_DRAG],
      getData: (type: string) => data.get(type) ?? "",
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  await act(async () =>
    drop.onDrop(event as unknown as Parameters<typeof drop.onDrop>[0]),
  );
  const after = studioStore.getState();
  const [added] = addedLayers(before.project, after.director.bundle!.project);
  expect(added).toBeTruthy();
  expect(after.workspace.selected).toBe(added);
  expect(after.settings).toMatchObject({ zoom: 6 * 30, fit: false });
  // The timeline renders the new clip; the next frames find and mark it.
  await act(async () => root!.render(<Probe />));
  act(nextFrames);
  const clip = [
    ...document.querySelectorAll<HTMLElement>("[data-layer-id]"),
  ].find((el) => el.dataset.layerId === added)!;
  expect(clip.dataset.revealed).toBe("true");
  expect(clip.scrollIntoView).toHaveBeenCalled();
  // The accent is brief; the zoom stays for the person to change.
  vi.advanceTimersByTime(REVEAL_MS);
  expect(clip.dataset.revealed).toBeUndefined();
  expect(studioStore.getState().settings.zoom).toBe(6 * 30);
});

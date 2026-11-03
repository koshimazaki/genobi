// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssetRail } from "../src/studio/AssetRail";
import { ProjectShelf } from "../src/studio/ProjectShelf";
import { ExpandedShelf } from "../src/studio/ExpandedShelf";
import { ShellContext, type ShellState } from "../src/studio/ShellContext";
import { studioStore } from "../src/studio/store";
import { PROJECT_ASSET_DRAG } from "../src/director/asset-drag";
import type { Project } from "../shared/director/types";
import studio from "../docs/director-bundle/example/studio.json";

const imported = vi.hoisted(() => [] as { files: File[]; use: string }[]);
vi.mock("../src/director/import-project-media", () => ({
  importProjectMedia: async (files: File[], use: string) => {
    imported.push({ files, use });
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const original = studioStore.getState();
let root: Root | null = null;
let hosts: Record<string, HTMLDivElement>;
let urls = 0;
const select = vi.fn();
beforeEach(() => {
  imported.length = 0;
  select.mockClear();
  URL.createObjectURL = () => `blob:test/${++urls}`;
  URL.revokeObjectURL = () => {};
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  // Posters are drawn only once a card is seen; jsdom never sees one.
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  studioStore.setState({ director: { history: [], drafts: {} } });
  const project = structuredClone(studio) as Project;
  // Bytes stand in for each file: no poster is drawn, no media decoded.
  const files = new Map(
    Object.values(project.assets).map((a) => [
      a.file.path,
      new Uint8Array(new ArrayBuffer(8)),
    ]),
  );
  studioStore.getState().actions.initialize({ project, files });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  studioStore.setState(original, true);
});

function render(ui: React.ReactNode, preset = "director") {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  hosts = new Proxy({} as Record<string, HTMLDivElement>, {
    get: (all, id: string) => (all[id] ??= document.createElement("div")),
  });
  hosts.gallery.className = "camera-gallery-host";
  const shell = {
    preset,
    assetsOpen: true,
    setAssetsOpen() {},
    select,
    hosts,
  } as unknown as ShellState;
  act(() =>
    root!.render(
      <ShellContext.Provider value={shell}>{ui}</ShellContext.Provider>,
    ),
  );
}
const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T & HTMLElement>(selector);
const button = (label: string) =>
  $<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const click = (el: HTMLElement) => act(() => el.click());
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
const frame = () =>
  act(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
const overlay = () => $('[role="dialog"][aria-label="Assets gallery"]');
const lightbox = () => $<HTMLDialogElement>("dialog.video-lightbox");

it("opens from the rail's Expand control and closes with Close or Escape", async () => {
  render(<AssetRail />);
  expect(overlay()).toBeNull();
  click(button("Expand assets"));
  expect(overlay()).not.toBeNull();
  const tabs = [...overlay()!.querySelectorAll('[role="tab"]')].map(
    (t) => t.textContent,
  );
  expect(tabs).toEqual(["Project", "Inspirations", "Library"]);
  // The selected tab takes focus.
  expect(document.activeElement?.id).toBe("expanded-assets-tab-project");
  click(button("Close expanded assets"));
  expect(overlay()).toBeNull();
  await frame();
  expect(document.activeElement).toBe(button("Expand assets"));

  click(button("Expand assets"));
  key(document.activeElement!, "Escape");
  expect(overlay()).toBeNull();
  // Escape left the rail itself open.
  expect($("#studio-assets")!.hidden).toBe(false);
});

it("shares the rail's tab and switches by click and arrow keys", () => {
  render(<AssetRail />);
  click(button("Expand assets"));
  click($("#expanded-assets-tab-inspirations")!);
  expect(
    $("#expanded-assets-tab-inspirations")!.getAttribute("aria-selected"),
  ).toBe("true");
  expect($("#assets-tab-inspirations")!.getAttribute("aria-selected")).toBe(
    "true",
  );
  const pane = $("#expanded-assets-pane-inspirations")!;
  expect(pane.hidden).toBe(false);
  expect(pane.textContent).toContain("palette.svg");
  expect(pane.textContent).toContain("Reference · style");
  key($("#expanded-assets-tab-inspirations")!, "ArrowRight");
  expect(document.activeElement?.id).toBe("expanded-assets-tab-gallery");
  expect($("#expanded-assets-pane-gallery")!.hidden).toBe(false);
  key(document.activeElement!, "Home");
  expect(document.activeElement?.id).toBe("expanded-assets-tab-project");
  expect($("#expanded-assets-pane-project")!.textContent).toContain(
    "orbit-motion.mp4",
  );
});

it("moves Camera's gallery into the expanded view and back to the rail", () => {
  render(<AssetRail />);
  expect($("#assets-pane-gallery")!.contains(hosts.gallery)).toBe(true);
  click(button("Expand assets"));
  expect($("#expanded-assets-pane-gallery")!.contains(hosts.gallery)).toBe(
    true,
  );
  expect($("#assets-pane-gallery")!.contains(hosts.gallery)).toBe(false);
  click(button("Close expanded assets"));
  expect($("#assets-pane-gallery")!.contains(hosts.gallery)).toBe(true);
});

it("opens a light view and steps through the collection", () => {
  render(<AssetRail />);
  click(button("Expand assets"));
  const names = [...overlay()!.querySelectorAll(".clip-info h3")].map(
    (h) => h.textContent,
  );
  expect(names.length).toBeGreaterThan(1);
  click(button(`View ${names[0]}`));
  expect(lightbox()!.hasAttribute("open")).toBe(true);
  expect(lightbox()!.getAttribute("aria-label")).toBe(names[0]);
  expect(lightbox()!.textContent).toContain(`1 / ${names.length}`);
  click(button("Next"));
  expect(lightbox()!.getAttribute("aria-label")).toBe(names[1]);
  key(lightbox()!, "ArrowLeft");
  expect(lightbox()!.getAttribute("aria-label")).toBe(names[0]);
  // Previous from the first wraps to the last.
  key(lightbox()!, "ArrowLeft");
  expect(lightbox()!.getAttribute("aria-label")).toBe(names.at(-1));
  key(lightbox()!, "ArrowRight");
  expect(lightbox()!.getAttribute("aria-label")).toBe(names[0]);
  // Escape is the light view's: the gallery stays open beneath it.
  key(lightbox()!, "Escape");
  expect(overlay()).not.toBeNull();
  act(() => {
    lightbox()!.dispatchEvent(new Event("cancel"));
  });
  expect(lightbox()).toBeNull();
  expect(overlay()).not.toBeNull();
});

it("shows audio in a plain player and images and video in Camera's lightbox", () => {
  render(<AssetRail />);
  click(button("Expand assets"));
  click(button("View pulse.wav"));
  expect(lightbox()!.querySelector("audio")).not.toBeNull();
  expect(lightbox()!.textContent).toContain("Download audio");
  click(button("Close preview"));
  click(button("View orbit-motion.mp4"));
  expect(lightbox()!.querySelector("video")).not.toBeNull();
  expect(lightbox()!.textContent).toContain("Used ·");
  click(button("Close preview"));
  click(button("View orbit-1.png"));
  expect(lightbox()!.querySelector("img.still-image")).not.toBeNull();
});

function dragPayload(el: HTMLElement) {
  const data: Record<string, string> = {};
  const transfer = {
    effectAllowed: "",
    setData: (type: string, value: string) => void (data[type] = value),
  };
  const event = new Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: transfer });
  act(() => {
    el.dispatchEvent(event);
  });
  return { data, effect: transfer.effectAllowed };
}

it("drags a card with exactly the rail tile's payload", () => {
  render(
    <>
      <div className="rail">
        <ProjectShelf role="production" />
      </div>
      <div className="expanded">
        <ExpandedShelf role="production" />
      </div>
    </>,
  );
  const bundle = studioStore.getState().director.bundle!;
  const ids = Object.entries(bundle.project.assets)
    .filter(([, a]) => a.use === "production")
    .map(([id]) => id);
  for (const id of ids) {
    const path = bundle.project.assets[id]!.file.path;
    const rail = $(`.rail button[title="${path}"]`)!;
    const expanded = $(`.expanded button[title="${path}"]`)!;
    expect(expanded.draggable).toBe(true);
    const a = dragPayload(rail);
    const b = dragPayload(expanded);
    expect(b).toEqual(a);
    expect(JSON.parse(b.data[PROJECT_ASSET_DRAG]!).assetId).toBe(id);
  }
});

it("refuses to drag while the project is busy, as the rail does", () => {
  render(<ExpandedShelf role="production" />);
  act(() => studioStore.getState().actions.operations({ rendering: true }));
  const card = $(".assets-expanded-media")!;
  expect(card.draggable).toBe(false);
});

it("takes dropped files into Project and Inspirations", async () => {
  render(<AssetRail />);
  click(button("Expand assets"));
  const drop = (zone: Element, file: File) =>
    act(async () => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: { types: ["Files"], files: [file], getData: () => "" },
      });
      zone.dispatchEvent(event);
    });
  const file = new File([new Uint8Array(4)], "shot.png", { type: "image/png" });
  await drop(
    $('#expanded-assets-pane-project [aria-label="Drop project assets"]')!,
    file,
  );
  click($("#expanded-assets-tab-inspirations")!);
  await drop(
    $('#expanded-assets-pane-inspirations [aria-label="Drop inspirations"]')!,
    file,
  );
  expect(imported.map((i) => [i.files[0]!.name, i.use])).toEqual([
    ["shot.png", "production"],
    ["shot.png", "reference"],
  ]);
});

it("lets the studio beneath take a drag that starts in the gallery", async () => {
  render(<AssetRail />);
  click(button("Expand assets"));
  dragPayload($(".assets-expanded-media")!);
  await frame();
  expect(overlay()!.hasAttribute("data-dragging")).toBe(true);
  act(() => {
    $(".assets-expanded-media")!.dispatchEvent(
      new Event("dragend", { bubbles: true }),
    );
  });
  expect(overlay()!.hasAttribute("data-dragging")).toBe(false);
});

it("marks inspirations on the rail's own shelf too", () => {
  render(<ProjectShelf role="reference" />);
  expect($(".genobi-asset-role")!.textContent).toBe("Reference · style");
});

it("offers Use in Camera on a card and leaves the view for Camera", async () => {
  render(<AssetRail />);
  click(button("Expand assets"));
  // The example records no prompts: a PNG is used, audio gets no control.
  expect(button("Use in Camera: orbit-1.png")).not.toBeNull();
  expect(button("Use in Camera: orbit-motion.mp4")).not.toBeNull();
  expect($('[aria-label="Use in Camera: pulse.wav"]')).toBeNull();
  expect($('[aria-label^="Recreate:"]')).toBeNull();
  click(button("Use in Camera: orbit-motion.mp4"));
  expect(select).toHaveBeenCalledWith("camera");
  expect(overlay()).toBeNull();
});

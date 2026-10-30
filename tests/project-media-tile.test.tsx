// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Asset } from "../shared/director/types";
import MediaTile from "../src/director/MediaTile";
import { claimPlayback, stopPlayback } from "../src/director/media-playback";
import { AssetRail } from "../src/studio/AssetRail";
import { ShellContext, type ShellState } from "../src/studio/ShellContext";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no media playback, object URLs or reduced-motion query: a small
// fake of each, recording what the tiles ask for.
const paused = new WeakMap<HTMLMediaElement, boolean>();
const plays: HTMLMediaElement[] = [];
let reduced = false;
let urls = 0;
const revoked: string[] = [];
beforeEach(() => {
  plays.length = 0;
  revoked.length = 0;
  reduced = false;
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get() {
      return paused.get(this) ?? true;
    },
  });
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    paused.set(this, false);
    plays.push(this);
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    if (paused.get(this) === false) {
      paused.set(this, true);
      this.dispatchEvent(new Event("pause"));
    }
  };
  HTMLMediaElement.prototype.load = () => {};
  URL.createObjectURL = () => `blob:test/${++urls}`;
  URL.revokeObjectURL = (url: string) => void revoked.push(url);
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("reduce"),
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  stopPlayback();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const bytes = new Uint8Array(new ArrayBuffer(8));
const asset = (kind: Asset["kind"], path: string): Asset => ({
  kind,
  use: "production",
  origin: "uploaded",
  file: { path, sha256: "a".repeat(64) },
  durationSeconds: kind === "image" ? undefined : 2,
});

let redraw = () => {};
function render(
  tiles: { asset: Asset; name: string; missing?: boolean }[],
  doubleClick = false,
) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  redraw = () =>
    act(() =>
      root!.render(
        <>
          {tiles.map((t) => (
            <MediaTile
              key={t.name}
              asset={t.asset}
              bytes={t.missing ? undefined : bytes}
              name={t.name}
              doubleClick={doubleClick}
            >
              {(frame) => (
                <button className="card" title={t.name}>
                  {frame}
                  <strong>{t.name}</strong>
                </button>
              )}
            </MediaTile>
          ))}
        </>,
      ),
    );
  redraw();
  return [...host.querySelectorAll<HTMLElement>(".media-tile")];
}
const hover = (tile: HTMLElement) =>
  act(() => {
    tile.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  });
const leave = (tile: HTMLElement) =>
  act(() => {
    tile.dispatchEvent(
      new MouseEvent("pointerout", {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
  });
const button = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === name,
  )!;
const click = (el: HTMLElement) =>
  act(() => {
    el.click();
  });
const flush = () => act(async () => {});

it("plays a video muted and looping on hover, and stops and lets go on leave", async () => {
  const [tile] = render([{ asset: asset("video", "a.mp4"), name: "a.mp4" }]);
  // Nothing is loaded before the pointer arrives.
  expect(tile.querySelector("video")).toBeNull();
  expect(urls).toBe(0);
  hover(tile);
  await flush();
  const video = tile.querySelector("video")!;
  expect(video.muted).toBe(true);
  expect(video.loop).toBe(true);
  expect(video.getAttribute("preload")).toBe("metadata");
  expect(plays).toEqual([video]);
  // The parent re-renders (playback ticks): the preview keeps playing.
  redraw();
  await flush();
  expect(tile.querySelector("video")).toBe(video);
  expect(video.getAttribute("src")).toMatch(/^blob:/);
  expect(video.paused).toBe(false);
  leave(tile);
  await flush();
  expect(tile.querySelector("video")).toBeNull();
  expect(video.paused).toBe(true);
  expect(revoked).toHaveLength(1);
});

it("plays one preview at a time", async () => {
  const [a, b] = render([
    { asset: asset("video", "a.mp4"), name: "a.mp4" },
    { asset: asset("video", "b.mp4"), name: "b.mp4" },
  ]);
  hover(a);
  await flush();
  const first = a.querySelector("video")!;
  // Keyboard focus on the second card plays it; the first goes back to its poster.
  act(() => b.querySelector<HTMLButtonElement>(".card")!.focus());
  await flush();
  expect(b.querySelector("video")).not.toBeNull();
  expect(first.paused).toBe(true);
  expect(a.querySelector("video")).toBeNull();
});

it("plays one sound at a time, with pause keeping its place", async () => {
  render([
    { asset: asset("audio", "one.wav"), name: "one.wav" },
    { asset: asset("audio", "two.wav"), name: "two.wav" },
  ]);
  click(button("Play one.wav"));
  await flush();
  const one = document.querySelectorAll("audio")[0];
  expect(one.paused).toBe(false);
  expect(document.querySelector(".media-tile-progress")).not.toBeNull();
  // Pause keeps the element (and its position) for the next play.
  click(button("Pause one.wav"));
  await flush();
  expect(one.paused).toBe(true);
  expect(document.querySelectorAll("audio")).toHaveLength(1);
  click(button("Play one.wav"));
  await flush();
  expect(one.paused).toBe(false);
  // Starting the other sound stops the first.
  click(button("Play two.wav"));
  await flush();
  expect(one.paused).toBe(true);
  expect(button("Play one.wav")).toBeDefined();
  expect(button("Pause two.wav")).toBeDefined();
  expect(document.querySelectorAll("audio")).toHaveLength(1);
  // Closing the drawer stops whatever is playing.
  act(() => stopPlayback());
  await flush();
  expect(button("Play two.wav")).toBeDefined();
  expect(document.querySelectorAll("audio")).toHaveLength(0);
});

it("shows a play button instead of hover playback under reduced motion", async () => {
  reduced = true;
  const [tile] = render([{ asset: asset("video", "a.mp4"), name: "a.mp4" }]);
  hover(tile);
  await flush();
  expect(tile.querySelector("video")).toBeNull();
  click(button("Play a.mp4"));
  await flush();
  const video = tile.querySelector("video")!;
  expect(video.muted).toBe(true);
  expect(video.paused).toBe(false);
});

it("opens a lightbox on double-click, closes on Escape and returns focus", async () => {
  const [tile] = render(
    [{ asset: asset("video", "clip.mp4"), name: "clip.mp4" }],
    true,
  );
  const card = tile.querySelector<HTMLButtonElement>(".card")!;
  act(() => {
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
  const dialog = document.querySelector<HTMLDialogElement>(
    'dialog[aria-label="clip.mp4"]',
  )!;
  expect(dialog.open).toBe(true);
  const video = dialog.querySelector("video")!;
  // With sound and controls, waiting for the person to press play.
  expect(video.controls).toBe(true);
  expect(video.muted).toBe(false);
  expect(video.autoplay).toBe(false);
  act(() => {
    dialog.dispatchEvent(new Event("cancel"));
  });
  await flush();
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(card);
});

it("opens audio and images from the Preview button", async () => {
  render([
    { asset: asset("audio", "song.wav"), name: "song.wav" },
    { asset: asset("image", "still.png"), name: "still.png" },
  ]);
  const preview = button("Preview song.wav");
  act(() => preview.focus());
  click(preview);
  await flush();
  const dialog = document.querySelector("dialog")!;
  expect(dialog.querySelector("audio")?.controls).toBe(true);
  click(button("Close preview"));
  await flush();
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(preview);
  click(button("Preview still.png"));
  await flush();
  expect(document.querySelector("dialog img")?.getAttribute("alt")).toBe(
    "still.png",
  );
});

it("keeps a single click as the card's own action", () => {
  const [tile] = render(
    [{ asset: asset("image", "still.png"), name: "still.png" }],
    true,
  );
  const clicked = vi.fn();
  tile.querySelector(".card")!.addEventListener("click", clicked);
  click(tile.querySelector<HTMLButtonElement>(".card")!);
  expect(clicked).toHaveBeenCalledTimes(1);
  expect(document.querySelector("dialog")).toBeNull();
});

it("shows a placeholder, and no player, for a missing file", async () => {
  const [tile] = render([
    { asset: asset("video", "gone.mp4"), name: "gone.mp4", missing: true },
  ]);
  expect(tile.textContent).toContain("Missing file");
  hover(tile);
  await flush();
  expect(tile.querySelector("video")).toBeNull();
  expect(button("Preview gone.mp4").hasAttribute("disabled")).toBe(true);
});

it("says so when a file will not play, and stops trying", async () => {
  const [tile] = render([
    { asset: asset("video", "bad.mp4"), name: "bad.mp4" },
  ]);
  hover(tile);
  await flush();
  act(() => {
    tile.querySelector("video")!.dispatchEvent(new Event("error"));
  });
  await flush();
  expect(tile.querySelector("video")).toBeNull();
  expect(tile.textContent).toContain("Can’t play");
});

it("closes the lightbox without closing the dialog it opened over", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const drawerClosed = vi.fn();
  act(() =>
    root!.render(
      <dialog open onClose={drawerClosed} onCancel={drawerClosed}>
        <MediaTile
          asset={asset("image", "still.png")}
          bytes={bytes}
          name="still.png"
          doubleClick
        >
          {(frame) => <button className="card">{frame}</button>}
        </MediaTile>
      </dialog>,
    ),
  );
  act(() => {
    host
      .querySelector(".card")!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
  const lightbox = document.querySelector<HTMLDialogElement>(
    "dialog.media-lightbox",
  )!;
  act(() => {
    lightbox.dispatchEvent(new Event("cancel"));
    lightbox.dispatchEvent(new Event("close"));
  });
  await flush();
  expect(document.querySelector("dialog.media-lightbox")).toBeNull();
  expect(drawerClosed).not.toHaveBeenCalled();
});

it("stops tile previews when the lightbox opens, and shares the turn with it", async () => {
  render([
    { asset: asset("audio", "one.wav"), name: "one.wav" },
    { asset: asset("video", "clip.mp4"), name: "clip.mp4" },
  ]);
  click(button("Play one.wav"));
  await flush();
  const one = document.querySelector("audio")!;
  expect(one.paused).toBe(false);
  click(button("Preview clip.mp4"));
  await flush();
  // Opening the lightbox stopped the sound.
  expect(one.paused).toBe(true);
  expect(document.querySelectorAll(".media-tile audio")).toHaveLength(0);
  const big = document.querySelector<HTMLVideoElement>("dialog video")!;
  act(() => {
    void big.play();
    big.dispatchEvent(new Event("play"));
  });
  // A tile starting now pauses the lightbox's player.
  click(button("Play one.wav"));
  await flush();
  expect(big.paused).toBe(true);
  expect(document.querySelector<HTMLAudioElement>("audio")!.paused).toBe(false);
});

it("stops a preview when the rail changes tab", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const hosts = new Proxy({} as Record<string, HTMLDivElement>, {
    get: (all, id: string) => (all[id] ??= document.createElement("div")),
  });
  const shell = {
    preset: "director",
    assetsOpen: true,
    setAssetsOpen() {},
    hosts,
  } as unknown as ShellState;
  act(() =>
    root!.render(
      <ShellContext.Provider value={shell}>
        <AssetRail />
      </ShellContext.Provider>,
    ),
  );
  const sound = document.createElement("audio");
  claimPlayback(sound);
  void sound.play();
  expect(sound.paused).toBe(false);
  click(document.querySelector<HTMLButtonElement>("#assets-tab-inspirations")!);
  await flush();
  expect(sound.paused).toBe(true);
});

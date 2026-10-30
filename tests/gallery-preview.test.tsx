// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import {
  galleryTemplates,
  GALLERY_AUDIO,
  galleryMedia,
} from "../shared/gallery/catalogue";
import GalleryCard from "../src/template-gallery/GalleryCard";
import { useSoundGesture } from "../src/template-gallery/useSoundGesture";
import TemplateGallery from "../src/template-gallery/TemplateGallery";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const hasFfprobe = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
let root: Root | undefined;
let hidden = false;
let reduced = false;
let intersect: (entries: { isIntersecting: boolean }[]) => void;
const play = vi.fn<() => Promise<void>>();
const pause = vi.fn();
beforeEach(() => {
  hidden = false;
  reduced = false;
  play.mockReset().mockResolvedValue(undefined);
  pause.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { hasBeenActive: false },
  });
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(id = "genobi-teaser") {
  const host = document.body.appendChild(document.createElement("div"));
  function Harness() {
    const allowed = useSoundGesture();
    const [previewing, setPreviewing] = useState(false);
    return (
      <GalleryCard
        template={galleryTemplates.find((t) => t.id === id)!}
        featured={false}
        active
        previewing={previewing}
        onPreview={setPreviewing}
        soundAllowed={allowed}
        onOpen={() => {}}
      />
    );
  }
  root = createRoot(host);
  act(() => root!.render(<Harness />));
  return {
    host,
    video: host.querySelector("video")!,
    card: host.querySelector("article")!,
  };
}
function pointer(card: Element, type: "pointerover" | "pointerout") {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  Object.defineProperty(event, "relatedTarget", { value: document.body });
  act(() => {
    card.dispatchEvent(event);
  });
}

it("never autoplays on load, previews muted before a gesture, then uses sound on hover", async () => {
  const { video, card } = mount();
  expect(play).not.toHaveBeenCalled();
  expect(video.muted).toBe(true);
  pointer(card, "pointerover");
  expect(play).toHaveBeenCalled();
  expect(video.muted).toBe(true);
  act(() =>
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })),
  );
  expect(video.muted).toBe(false);
  pointer(card, "pointerout");
  expect(video.muted).toBe(true);
  expect(pause).toHaveBeenCalled();
});

it("Sound enables audio on the first click and Mute switches it off", () => {
  const { host, video, card } = mount();
  pointer(card, "pointerover");
  const toggle = host.querySelector<HTMLButtonElement>(".template-sound")!;
  act(() => toggle.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  let inGesture = false;
  let synchronousPlay = false;
  play.mockImplementation(() => {
    synchronousPlay ||= inGesture;
    return Promise.resolve();
  });
  act(() => {
    inGesture = true;
    toggle.click();
    inGesture = false;
  });
  expect(synchronousPlay).toBe(true);
  expect(video.muted).toBe(false);
  act(() => toggle.click());
  expect(video.muted).toBe(true);
  expect(host.querySelector("button button")).toBeNull();
});

it("keyboard focus previews with sound after a keyboard gesture and mutes on blur", () => {
  const { host, video } = mount();
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    ),
  );
  act(() =>
    host.querySelector<HTMLButtonElement>(".template-card-preview")!.focus(),
  );
  expect(video.muted).toBe(false);
  act(() =>
    host.querySelector<HTMLButtonElement>(".template-card-preview")!.blur(),
  );
  expect(video.muted).toBe(true);
});

it("pauses and mutes a keyboard-focused card when another card is hovered", () => {
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  act(() => root!.render(<TemplateGallery active />));
  const [a, b] = [...host.querySelectorAll("article")];
  const videoA = a.querySelector("video")!;
  const videoB = b.querySelector("video")!;
  const buttonA = a.querySelector<HTMLButtonElement>(".template-card-preview")!;
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    ),
  );
  act(() => buttonA.focus());
  expect(play.mock.contexts.at(-1)).toBe(videoA);
  expect(videoA.muted).toBe(false);
  play.mockClear();
  pause.mockClear();

  pointer(b, "pointerover");
  expect(document.activeElement).toBe(buttonA);
  expect(play.mock.contexts).toEqual([videoB]);
  expect(pause.mock.contexts).toContain(videoA);
  expect(videoA.muted).toBe(true);
  expect(videoB.muted).toBe(false);
});

it("starts a keyboard-focused offscreen preview when it intersects", () => {
  const { host, video } = mount();
  act(() => intersect([{ isIntersecting: false }]));
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    ),
  );
  act(() =>
    host.querySelector<HTMLButtonElement>(".template-card-preview")!.focus(),
  );
  expect(play).not.toHaveBeenCalled();
  expect(video.muted).toBe(true);

  act(() => intersect([{ isIntersecting: true }]));
  expect(play).toHaveBeenCalledOnce();
  expect(video.muted).toBe(false);
});

it("falls back to muted playback and offers Sound if the browser refuses audio", async () => {
  play.mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { hasBeenActive: true },
  });
  const { host, video, card } = mount();
  await act(async () => pointer(card, "pointerover"));
  expect(video.muted).toBe(true);
  expect(host.querySelector(".template-sound")!.textContent).toBe("Sound");
  await act(async () =>
    (host.querySelector(".template-sound") as HTMLButtonElement).click(),
  );
  expect(video.muted).toBe(false);
});

it("pauses and mutes hidden and offscreen previews, and respects reduced motion", () => {
  const { video, card } = mount();
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    ),
  );
  pointer(card, "pointerover");
  expect(video.muted).toBe(false);
  act(() => intersect([{ isIntersecting: false }]));
  expect(video.muted).toBe(true);
  hidden = true;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(pause).toHaveBeenCalled();
  hidden = false;
  reduced = true;
  play.mockClear();
  pointer(card, "pointerout");
  pointer(card, "pointerover");
  expect(play).not.toHaveBeenCalled();
  expect(video.muted).toBe(true);
});

it("does not restart a preview when leaving aborts an outstanding play", async () => {
  let reject!: (reason: DOMException) => void;
  play.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { card } = mount();
  pointer(card, "pointerover");
  await act(async () => {
    intersect([{ isIntersecting: false }]);
    reject(new DOMException("Paused", "AbortError"));
  });
  expect(play).toHaveBeenCalledTimes(1);
});

it("keeps silent cards muted after a gesture and offers no Sound control", () => {
  const { host, video, card } = mount("product-video-generation");
  act(() =>
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })),
  );
  pointer(card, "pointerover");
  expect(video.muted).toBe(true);
  expect(host.querySelector(".template-sound")).toBeNull();
});

it.skipIf(!hasFfprobe)(
  "records every gallery preview with an audio stream",
  () => {
    const audible = [];
    for (const template of galleryTemplates) {
      const media = galleryMedia(template);
      if (!media) continue;
      const result = execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "json",
        `public${media.video}`,
      ]);
      if (JSON.parse(result.toString()).streams.length)
        audible.push(template.id);
    }
    expect([...GALLERY_AUDIO].sort()).toEqual(audible.sort());
  },
);

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { galleryMedia, galleryTemplates } from "../shared/gallery/catalogue";
import TemplateGallery from "../src/template-gallery/TemplateGallery";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
const play = vi.fn(() => Promise.resolve());
beforeEach(() => {
  play.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => {
    run();
    return 0;
  });
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const withVideo = galleryTemplates.filter((t) => galleryMedia(t));
const [first, second] = withVideo;

function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  act(() => root!.render(<TemplateGallery active />));
  return host;
}
const view = (host: HTMLElement, name: string) =>
  host.querySelector<HTMLButtonElement>(
    `button[aria-label="View ${name} full size"]`,
  )!;
const lightbox = () => document.querySelector("dialog.video-lightbox");
const drawer = () => document.querySelector(".template-drawer");

it("gives every card with a video a labelled View icon, none without", () => {
  const host = mount();
  for (const template of galleryTemplates) {
    const button = view(host, template.name);
    expect(!!button).toBe(!!galleryMedia(template));
    if (button) expect(button.title).toBe("View full size");
  }
});

it("opens the full-resolution cut without the drawer, and Esc returns focus to the icon", () => {
  const host = mount();
  // Before opening, nothing names the full file: only the hover preview.
  expect(
    document.querySelector(`video[src="${galleryMedia(first)!.video}"]`),
  ).toBeNull();
  const icon = view(host, first.name);
  icon.focus();
  act(() => icon.click());
  const dialog = lightbox()!;
  expect(dialog.hasAttribute("open")).toBe(true);
  expect(dialog.getAttribute("aria-label")).toBe(first.name);
  expect(dialog.querySelector("video")!.getAttribute("src")).toBe(
    galleryMedia(first)!.video,
  );
  expect(dialog.querySelector(".clip-model")).not.toBeNull();
  expect(drawer()).toBeNull();
  // The hover preview stays paused behind the lightbox.
  play.mockClear();
  const hover = new Event("pointerover", { bubbles: true });
  Object.defineProperty(hover, "pointerType", { value: "mouse" });
  Object.defineProperty(hover, "relatedTarget", { value: document.body });
  act(() => {
    host.querySelectorAll("article")[1].dispatchEvent(hover);
  });
  expect(
    play.mock.contexts.some((video) =>
      (video as Element).closest(".template-card"),
    ),
  ).toBe(false);
  act(() => {
    dialog.dispatchEvent(new Event("cancel"));
  });
  expect(lightbox()).toBeNull();
  expect(drawer()).toBeNull();
  expect(document.activeElement).toBe(icon);
});

it("steps through the visible cards with the arrow keys and returns focus to the card on show", () => {
  const host = mount();
  act(() => view(host, first.name).click());
  act(() => {
    lightbox()!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  expect(lightbox()!.getAttribute("aria-label")).toBe(second.name);
  expect(lightbox()!.textContent).toContain(`2 / ${withVideo.length}`);
  act(() =>
    lightbox()!
      .querySelector<HTMLButtonElement>('[aria-label="Close preview"]')!
      .click(),
  );
  expect(lightbox()).toBeNull();
  expect(document.activeElement).toBe(view(host, second.name));
});

it("opens the same cut from the drawer, and closing keeps the drawer open", () => {
  const host = mount();
  act(() =>
    host
      .querySelector<HTMLButtonElement>(`[aria-label="View ${first.name}"]`)!
      .click(),
  );
  const button = drawer()!.querySelector<HTMLButtonElement>(
    `[aria-label="View ${first.name} full size"]`,
  )!;
  button.focus();
  act(() => button.click());
  expect(lightbox()!.querySelector("video")!.getAttribute("src")).toBe(
    galleryMedia(first)!.video,
  );
  // One template alone: no previous / next from the drawer.
  expect(lightbox()!.querySelector('[aria-label="Next"]')).toBeNull();
  act(() =>
    lightbox()!
      .querySelector<HTMLButtonElement>('[aria-label="Close preview"]')!
      .click(),
  );
  expect(drawer()).not.toBeNull();
  expect(document.activeElement).toBe(button);
});

it("copies the watch link and opens the public page in a new tab from the card row", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    get: () => ({ writeText }),
  });
  const host = mount();
  const row = view(host, first.name).parentElement!;
  const copy = row.querySelector<HTMLButtonElement>(
    `[aria-label="Copy ${first.name} video link"]`,
  )!;
  expect(copy.title).toBe("Copy link");
  // The row's clicks never reach the document's sound-gesture listener.
  const gesture = vi.fn();
  document.addEventListener("click", gesture);
  document.addEventListener("pointerdown", gesture);
  act(() => {
    copy.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  await act(async () => copy.click());
  document.removeEventListener("click", gesture);
  document.removeEventListener("pointerdown", gesture);
  expect(gesture).not.toHaveBeenCalled();
  expect(writeText).toHaveBeenCalledWith(
    `${location.origin}/watch/${first.id}`,
  );
  expect(row.querySelector('[role="status"]')!.textContent).toBe("Link copied");
  const page = row.querySelector<HTMLAnchorElement>(
    `a[aria-label="Open ${first.name} page in a new tab"]`,
  )!;
  expect(page.getAttribute("href")).toBe(`/watch/${first.id}`);
  expect(page.target).toBe("_blank");
  expect(page.rel).toBe("noopener");
  expect(page.title).toBe("Open page in new tab");
  expect(drawer()).toBeNull();
});

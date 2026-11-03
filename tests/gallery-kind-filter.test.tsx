// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import Gallery from "../src/components/Gallery";
import { jobKind, presentKinds, sourceKind } from "../src/gallery-kind";
import type { Job, Source } from "../shared/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// Library clips pause when scrolled away; jsdom has no observer.
globalThis.IntersectionObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;

const job = (id: string, patch: Partial<Job>) =>
  ({
    id,
    status: "Ready",
    resultUrl: `/api/clips/${id}`,
    description: `Study ${id}`,
    generator: "video",
    duration: 6,
    costEstimateUsd: 0.5,
    createdAt: new Date().toISOString(),
    ...patch,
  }) as unknown as Job;
const library = {
  id: "library-01",
  label: "Library clip",
  url: "/media/library-01.mp4",
  width: 960,
  height: 528,
  duration: 10,
  origin: "sample",
  setup: { generator: "video", description: "x", costUsd: 1 },
} as unknown as Source;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

const mount = (jobs: Job[], sources: Source[] = []) => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <Gallery
        jobs={jobs}
        sources={sources}
        generator="video"
        onUpscale={() => {}}
        onRetry={() => {}}
        onSelect={() => {}}
        onLibrarySetup={() => {}}
        onHide={() => {}}
        hiddenCount={0}
        onRestoreHidden={() => {}}
      />,
    ),
  );
  return host;
};
const chips = (host: HTMLElement) =>
  [...host.querySelectorAll(".gallery-kinds button")].map((b) => b.textContent);
const click = (host: HTMLElement, label: string) => {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  if (!button) throw new Error(`no ${label} button`);
  act(() => button.click());
};
const titles = (host: HTMLElement) =>
  [...host.querySelectorAll(".clip-card h3")].map((h) => h.textContent);

describe("the gallery's kind filter", () => {
  it("derives kind from the generator and the source's media type", () => {
    expect(jobKind({ generator: "image" })).toBe("image");
    expect(jobKind({ generator: "edit" })).toBe("image");
    expect(jobKind({ generator: "audio" })).toBe("audio");
    expect(jobKind({ generator: "upscale" })).toBe("video");
    expect(sourceKind({})).toBe("video");
    expect(sourceKind({ mediaType: "image" })).toBe("image");
    expect(
      presentKinds([{ generator: "audio" }, { generator: "image" }], []),
    ).toEqual(["image", "audio"]);
  });

  it("names only the kinds the gallery holds, and none for a single kind", () => {
    let host = mount([job("v", {}), job("u", { generator: "upscale" })]);
    expect(host.querySelector(".gallery-kinds")).toBeNull();
    act(() => root?.unmount());
    host = mount([job("v", {}), job("i", { generator: "image" })]);
    expect(chips(host)).toEqual(["All", "Images", "Videos"]);
    expect(host.querySelector(".gallery-kinds .active")?.textContent).toBe(
      "All",
    );
  });

  it("shows only the chosen kind, library clips included", () => {
    const host = mount(
      [
        job("v", {}),
        job("i", { generator: "image" }),
        job("a", { generator: "audio" }),
      ],
      [library],
    );
    expect(chips(host)).toEqual(["All", "Images", "Videos", "Audio"]);
    click(host, "Images");
    expect(titles(host)).toEqual(["Study i"]);
    click(host, "Videos");
    expect(titles(host)).toEqual(["Study v", "Library clip"]);
    click(host, "Audio");
    expect(titles(host)).toEqual(["Study a"]);
    click(host, "All");
    expect(titles(host)).toHaveLength(4);
  });

  it("combines with This session and says so when nothing is left", () => {
    const host = mount([
      job("mine", {}),
      job("theirs", { generator: "image", shared: true, origin: "terminal" }),
      job("mine-image", { generator: "image" }),
    ] as Job[]);
    click(host, "Images");
    expect(titles(host)).toEqual(["Study theirs", "Study mine-image"]);
    click(host, "This session");
    expect(titles(host)).toEqual(["Study mine-image"]);
    act(() => root?.unmount());
    const only = mount([
      job("mine", {}),
      job("theirs", { generator: "image", shared: true, origin: "agent" }),
    ] as Job[]);
    click(only, "Images");
    click(only, "This session");
    expect(titles(only)).toEqual([]);
    expect(only.querySelector(".gallery-empty h3")?.textContent).toBe(
      "No images in this session yet.",
    );
    expect(only.querySelector(".gallery-empty p")?.textContent).toBe(
      "Choose All to see everything the gallery holds.",
    );
  });
});

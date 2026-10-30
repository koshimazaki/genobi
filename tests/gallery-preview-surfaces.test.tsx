// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import catalogue from "../public/media/gallery.json";
import { parseLibrary } from "../shared/library";
import { galleryMedia, galleryTemplates } from "../shared/gallery/catalogue";
import { galleryPage } from "../shared/gallery/page";
import GalleryCard from "../src/template-gallery/GalleryCard";
import DrawerOutput from "../src/template-gallery/DrawerOutput";
import Gallery from "../src/components/Gallery";
import FeaturedVideo from "../src/components/FeaturedVideo";
import JobMedia from "../src/components/JobMedia";
import type { Job } from "../shared/types";
import { templateCards } from "../src/director/TemplateCards";
import TasteLocalDemo from "../src/licensing/TasteLocalDemo";
import TasteExamples from "../src/licensing/TasteExamples";

const library = parseLibrary(catalogue);
const documentOf = (element: React.ReactNode) =>
  new DOMParser().parseFromString(renderToStaticMarkup(element), "text/html");
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(galleryTemplates)(
  "$name keeps card playback separate from full playback",
  (template) => {
    const media = galleryMedia(template);
    const card = documentOf(
      <GalleryCard
        template={template}
        featured
        active
        previewing={false}
        onPreview={() => {}}
        soundAllowed={false}
        onOpen={() => {}}
      />,
    );
    if (!media) {
      expect(card.querySelector("video")).toBeNull();
      return;
    }
    const video = card.querySelector("video")!;
    expect(video.getAttribute("src")).toBe(media.preview);
    expect(video.getAttribute("poster")).toBe(media.previewPoster);
    expect(video.preload).toBe("none");
    expect(video.autoplay).toBe(false);
    const drawer = documentOf(
      <DrawerOutput template={template} media={media} />,
    );
    expect(drawer.querySelector("video")!.getAttribute("src")).toBe(
      media.video,
    );
    expect(drawer.querySelector("video")!.preload).toBe("none");
    for (const surface of ["watch", "embed"]) {
      const html = galleryPage(
        `/${surface}/${template.id}`,
        "https://studio.test",
      )!.body;
      const page = new DOMParser().parseFromString(html, "text/html");
      expect(page.querySelector("video")!.getAttribute("src")).toBe(
        media.video,
      );
      expect(page.querySelector("video")!.preload).toBe("none");
      expect(
        page
          .querySelector('meta[property="og:video"]')!
          .getAttribute("content"),
      ).toBe(`https://studio.test${media.video}`);
      expect(html).not.toContain(".preview.");
    }
  },
);

it("the Director picker uses previews while its template IDs stay canonical", () => {
  for (const card of templateCards) {
    const media = galleryMedia(
      galleryTemplates.find((t) => t.id === card.id)!,
    )!;
    expect(card.video).toBe(media.preview);
    expect(card.poster).toBe(media.previewPoster);
  }
});

it("Camera grid and hero load posters first, then open full files in the lightbox", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(),
  });
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <Gallery
          jobs={[]}
          sources={library}
          generator="upscale"
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
    for (const [index, video] of [
      ...host.querySelectorAll("video"),
    ].entries()) {
      expect(video.getAttribute("src")).toBe(library[index].preview);
      expect(video.getAttribute("poster")).toBe(library[index].previewPoster);
      expect(video.preload).toBe("none");
      expect(video.autoplay).toBe(false);
    }
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>(".clip-play")!.click());
    expect(host.querySelector("dialog video")!.getAttribute("src")).toBe(
      library[0].url,
    );
    expect(host.querySelector("dialog a[download]")!.getAttribute("href")).toBe(
      library[0].url,
    );
    act(() =>
      root.render(<FeaturedVideo source={library[0]} onRetry={() => {}} />),
    );
    expect(host.querySelector("video")!.getAttribute("src")).toBe(
      library[0].preview,
    );
    expect(host.querySelector("video")!.preload).toBe("none");
    act(() => host.querySelector<HTMLButtonElement>(".expand-video")!.click());
    expect(host.querySelector("dialog video")!.getAttribute("src")).toBe(
      library[0].url,
    );
  } finally {
    act(() => root.unmount());
  }
});

it("Taste's local video demos never preload their video streams", () => {
  for (const element of [
    <TasteLocalDemo id="transitions-ui-generation" />,
    <TasteExamples />,
  ]) {
    const video = documentOf(element).querySelector("video")!;
    expect(video.preload).toBe("none");
    expect(video.autoplay).toBe(false);
    expect(video.querySelector("source")!.getAttribute("src")).toMatch(
      /\.preview\.mp4$/,
    );
  }
});

it("drops invalid preview metadata without altering the full upscale source", () => {
  const [clip] = parseLibrary([
    {
      ...catalogue[0],
      preview: "https://outside.test/v.mp4",
      previewPoster: 42,
    },
  ]);
  expect(clip.url).toBe(catalogue[0].url);
  expect(clip.width).toBe(catalogue[0].width);
  expect(clip.preview).toBeUndefined();
  expect(clip.previewPoster).toBeUndefined();
});

it("still decodes the first frame when a new generation becomes ready", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const job = {
    id: "new",
    generator: "video",
    status: "Generating",
    createdAt: new Date().toISOString(),
  } as Job;
  try {
    act(() => root.render(<JobMedia job={job} />));
    expect(host.querySelector("video")).toBeNull();
    act(() =>
      root.render(
        <JobMedia
          job={{ ...job, status: "Ready", resultUrl: "/api/clips/new" }}
        />,
      ),
    );
    expect(host.querySelector("video")!.preload).toBe("auto");
  } finally {
    act(() => root.unmount());
  }
});

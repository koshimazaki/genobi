import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Gallery from "../src/components/Gallery";
import VideoLightbox from "../src/components/VideoLightbox";
import { modelSignature } from "../src/generators";
import type { Generator, Job, Source, VideoModel } from "../shared/types";
import { libraryMatchesMode } from "../src/library";

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
const jobs = [
  job("ltx", { model: "ltx-2.5-pro" }),
  job("flux", { model: "flux-3" }),
  job("old", {}),
  job("up", { generator: "upscale", model: "flux-3" }),
];
const sources = [
  {
    id: "library-01",
    label: "Library clip",
    url: "/media/library-01.mp4",
    width: 960,
    height: 528,
    duration: 10,
    origin: "sample",
    setup: { generator: "video", description: "x", costUsd: 1 },
  } as unknown as Source,
];
const creature = [
  {
    id: "library-05",
    label: "Creature clip",
    url: "/media/library-05.mp4",
    width: 1920,
    height: 1080,
    duration: 15,
    origin: "sample",
    model: "minimax-h3-router",
    about: "Machine generated with MiniMax H3 (open weights).",
  } as Source,
];
const render = (
  generator: Generator = "video",
  model?: VideoModel,
  shown: Source[] = sources,
) =>
  renderToStaticMarkup(
    <Gallery
      jobs={jobs}
      sources={shown}
      generator={generator}
      model={model}
      onUpscale={() => {}}
      onRetry={() => {}}
      onSelect={() => {}}
      onLibrarySetup={() => {}}
      onHide={() => {}}
      hiddenCount={0}
      onRestoreHidden={() => {}}
    />,
  );
const tags = (html: string) =>
  [...html.matchAll(/class="clip-model"[^>]*>([^<]+)</g)].map((m) => m[1]);

describe("the gallery signs every clip with its model", () => {
  it("names a clip made outside the studio by its model's provenance only", () => {
    const html = render("video", undefined, creature);
    expect(html).toContain('title="MiniMax H3 (open weights)"');
    expect(html).toContain(
      'title="Machine generated with MiniMax H3 (open weights)."',
    );
    // The always-visible footnote fits a mixed catalogue.
    expect(html).toContain(
      "Recreate loads the saved prompt and settings where a clip has them.",
    );
    expect(html).not.toContain("existing studio");
    const lightbox = renderToStaticMarkup(
      <VideoLightbox
        clip={{
          url: "/media/library-05.mp4",
          label: "Creature clip",
          about: "Machine generated with MiniMax H3 (open weights).",
        }}
        onClose={() => {}}
      />,
    );
    expect(lightbox).toContain(
      "Machine generated with MiniMax H3 (open weights).",
    );
  });

  it("tags each card from job.model and job.generator", () => {
    // The order of the cards: LTX, FLUX, a run from before the switch, an
    // upscale, then the library clip, which the catalogue records as FLUX 3.
    expect(tags(render())).toEqual([
      "LTX-2.5",
      "FLUX 3",
      "FLUX 3",
      "UPSCALE",
      "FLUX 3",
    ]);
  });

  it("titles the tag with the menu name and keeps it muted", () => {
    expect(render()).toContain(
      'class="clip-model" title="LTX-2.5 Pro · Text to video"',
    );
    expect(modelSignature({ generator: "upscale" })).toEqual({
      tag: "UPSCALE",
      title: "FLUX Video Upscale",
    });
  });

  it("no longer badges an LTX clip as FLUX 3 over its media", () => {
    expect(render()).not.toContain('class="clip-badge">FLUX 3');
  });

  it("filters curated examples by composer mode without hiding session jobs", () => {
    const html = render("video", "ltx-2.5");
    expect(html).not.toContain("Library clip");
    expect(tags(html)).toEqual(["LTX-2.5", "FLUX 3", "FLUX 3", "UPSCALE"]);
    expect(render("image", "flux-3-klein")).not.toContain("Library clip");
    expect(render("upscale")).toContain("Library clip");
    const ltx = {
      ...sources[0],
      setup: { ...sources[0].setup!, model: "ltx-2.5-pro" as const },
    };
    expect(libraryMatchesMode(ltx, "video", "ltx-2.5")).toBe(true);
    expect(libraryMatchesMode(ltx, "video", "flux-3")).toBe(false);
  });

  it("keeps media actions named when compact labels disappear and omits card costs", () => {
    const html = render();
    expect(html).not.toContain("$");
    for (const action of ["Recreate", "Download", "Upscale"])
      expect(html).toContain(`aria-label="${action}"`);
  });

  it("names the model in the lightbox too", () => {
    const html = renderToStaticMarkup(
      <VideoLightbox
        clip={{
          url: "/api/clips/ltx",
          label: "Study ltx",
          signature: modelSignature({ generator: "video", model: "ltx-2.5" }),
        }}
        onClose={() => {}}
      />,
    );
    expect(tags(html)).toEqual(["LTX-2.5"]);
  });

  it("names downloaded results neutrally and leaves curated filenames alone", () => {
    const html = render();
    const names = [...html.matchAll(/download="([^"]+)"/g)].map((m) => m[1]);
    // A job output carries the studio's own name and the run's id, whatever
    // model made it, with the extension it really has.
    expect(names).toContain("genobi-study-ltx.mp4");
    expect(names).toContain("genobi-study-up.mp4");
    // A curated clip keeps the filename the catalogue gives it.
    expect(names).toContain("library-01.mp4");
    expect(html).not.toMatch(/flux-study/);
  });

  it("names the lightbox download neutrally too", () => {
    const html = renderToStaticMarkup(
      <VideoLightbox
        clip={{
          url: "/api/clips/ltx",
          label: "Study ltx",
          signature: modelSignature({ generator: "video", model: "ltx-2.5" }),
        }}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('download="genobi-study.mp4"');
    expect(html).not.toMatch(/flux-study/);
  });
  it("marks a take from a terminal or an agent and keeps its card's actions", () => {
    const shared = [
      job("song", {
        generator: "audio",
        model: "minimax-music-3",
        mediaType: "audio",
        origin: "terminal",
        shared: true,
      } as Partial<Job>),
      job("agent", { origin: "agent", shared: true } as Partial<Job>),
    ];
    const html = renderToStaticMarkup(
      <Gallery
        jobs={[...jobs, ...shared]}
        sources={sources}
        onUpscale={() => {}}
        onRetry={() => {}}
        onSelect={() => {}}
        onLibrarySetup={() => {}}
        onHide={() => {}}
        hiddenCount={0}
        onRestoreHidden={() => {}}
      />,
    );
    const marks = [...html.matchAll(/clip-origin">([^<]+)</g)].map((m) => m[1]);
    expect(marks).toEqual(["From terminal", "From agent"]);
    // Recreate and Download, as on any card; the song keeps its file type.
    expect(html).toContain('download="genobi-study-song.mp3"');
    expect(html.match(/aria-label="Recreate"/g)).toHaveLength(7);
  });
});

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import JobMedia from "../src/components/JobMedia";
import Clip from "../src/components/Clip";
import { heroMedia, activeRun } from "../src/hero";
import type { Job, Source } from "../shared/types";

const finished = {
  id: "job-1",
  status: "Ready",
  resultUrl: "/api/clips/job-1",
  description: "A chair in a cabin",
  generator: "video",
  createdAt: new Date().toISOString(),
} as unknown as Job;

const library = renderToStaticMarkup(
  <Clip url="/media/library-01.mp4" label="Library clip" onOpen={() => {}} />,
);

describe("the hero treats a finished job like a library clip", () => {
  // The two used to diverge: a library clip offered a play button that opened
  // the lightbox, while a freshly generated one fell back to native controls
  // and offered no play button at all.
  it("gives a finished job the same play button", () => {
    const generated = renderToStaticMarkup(
      <JobMedia job={finished} onOpen={() => {}} />,
    );
    expect(generated).toContain('class="clip-play"');
    expect(library).toContain('class="clip-play"');
  });

  it("offers no native controls in either, so play opens the lightbox", () => {
    const generated = renderToStaticMarkup(
      <JobMedia job={finished} onOpen={() => {}} />,
    );
    expect(generated).not.toContain("controls");
    expect(library).not.toContain("controls");
  });

  it("does not preload a saved result when revisiting the page", () => {
    const generated = renderToStaticMarkup(
      <JobMedia job={finished} onOpen={() => {}} />,
    );
    expect(generated).toContain('preload="none"');
  });

  it("shows no player while the job is still running", () => {
    const running = renderToStaticMarkup(
      <JobMedia
        job={{ ...finished, status: "Generating" }}
        onOpen={() => {}}
      />,
    );
    expect(running).not.toContain("clip-play");
    expect(running).toContain("Your scene is taking shape");
  });

  it("shows no player when the media is gone", () => {
    const gone = renderToStaticMarkup(
      <JobMedia
        job={{ ...finished, mediaAvailable: false }}
        onOpen={() => {}}
      />,
    );
    expect(gone).not.toContain("clip-play");
    expect(gone).toContain("Result no longer stored");
  });
});

const clip = (id: string, origin: Source["origin"] = "sample"): Source => ({
  id,
  label: id,
  url: `/media/${id}.mp4`,
  width: 960,
  height: 528,
  duration: 5,
  origin,
});
const clips = [clip("library-01"), clip("library-03")];
const mine = { ...finished, id: "job-mine" } as Job;
/** The upscale source the server publishes for `mine`. */
const myClip = { ...clip("job-mine", "generated"), label: "My motorbike" };

describe("the main view follows the run the composer holds", () => {
  it("opens on the first catalogue clip while the session has nothing of its own", () => {
    expect(
      heroMedia({
        generator: "video",
        catalogueId: null,
        runs: [],
        samples: clips,
      }),
    ).toEqual({ source: clips[0] });
  });

  it("gives a loaded catalogue clip the view over the visitor's own run", () => {
    // The clip Recreate loaded is the one whose prompt is in the composer, so
    // leaving the visitor's newest run here would show a different scene.
    expect(
      heroMedia({
        generator: "video",
        catalogueId: "library-03",
        selected: mine,
        runs: [mine],
        samples: clips,
      }),
    ).toEqual({ source: clips[1] });
  });

  it("keeps the visitor's own run when they have loaded no catalogue clip", () => {
    expect(
      heroMedia({
        generator: "video",
        catalogueId: null,
        selected: mine,
        runs: [mine],
        samples: clips,
      }),
    ).toEqual({ job: mine });
  });

  it("never presents a catalogue id as a job, even an unknown one", () => {
    // A catalogue id is not a session row: showing it as a job would start a
    // poll and a link for something this browser does not own.
    const gone = heroMedia({
      generator: "video",
      catalogueId: "library-09",
      selected: mine,
      runs: [mine],
      samples: clips,
    });
    expect(gone).toEqual({ job: mine });
    expect(gone.job?.id).toBe("job-mine");
    expect(
      heroMedia({
        generator: "video",
        catalogueId: "library-01",
        runs: [],
        samples: [],
      }),
    ).toEqual({ source: undefined });
  });

  it("keeps the catalogue clip out of the job it replaces", () => {
    const hero = heroMedia({
      generator: "video",
      catalogueId: "library-03",
      selected: mine,
      runs: [mine],
      samples: clips,
    });
    expect(hero.job).toBeUndefined();
  });
});

describe("Upscale follows the clip the composer is upscaling", () => {
  it("shows the selected upscale source over the catalogue clip still in the composer", () => {
    // Recreating library-03 and then upscaling library-01 used to leave the
    // recreated clip on screen while the composer upscaled another one.
    expect(
      heroMedia({
        generator: "upscale",
        catalogueId: "library-03",
        upscale: clips[0],
        selected: mine,
        runs: [mine],
        samples: clips,
      }),
    ).toEqual({ source: clips[0] });
  });

  it("shows the run itself when the clip being upscaled is one of the visitor's own", () => {
    // Its id is a session row, so it is the run — not a clip from the library.
    expect(
      heroMedia({
        generator: "upscale",
        catalogueId: null,
        upscale: myClip,
        selected: mine,
        runs: [mine],
        samples: clips,
      }),
    ).toEqual({ job: mine });
  });

  it("shows the clip alone when the visitor has hidden the run that made it", () => {
    expect(
      heroMedia({
        generator: "upscale",
        catalogueId: null,
        upscale: myClip,
        runs: [],
        samples: clips,
      }),
    ).toEqual({ source: myClip });
  });

  it("falls back to the run on screen when nothing is chosen to upscale yet", () => {
    expect(
      heroMedia({
        generator: "upscale",
        catalogueId: "library-03",
        selected: mine,
        runs: [mine],
        samples: clips,
      }),
    ).toEqual({ source: clips[1] });
    expect(
      heroMedia({
        generator: "upscale",
        catalogueId: null,
        selected: mine,
        runs: [mine],
        samples: clips,
      }),
    ).toEqual({ job: mine });
  });
});

describe("the run the screen holds", () => {
  const runs = [{ id: "job-new" }, { id: "job-old" }] as Job[];
  // The history API returns newest first, on both adapters, so the first
  // visible run is the newest one.
  it("is the linked or chosen run when there is one", () => {
    expect(activeRun("job-old", runs, runs)?.id).toBe("job-old");
  });
  it("otherwise the newest visible run, so a returning session opens on it", () => {
    expect(activeRun(null, runs, runs)?.id).toBe("job-new");
  });
  it("is nothing when the session has no visible runs", () => {
    expect(activeRun(null, [], [])).toBeUndefined();
  });
  it("keeps the chosen run when the visitor hides its card", () => {
    // Hiding is "Hide from this browser gallery", a filter over the cards and
    // not a withdrawal of the choice. Reading the choice out of the visible
    // runs left the composer holding the hidden run while the main view fell
    // back to a library clip — two runs on one screen, from the act of hiding.
    const newest = runs[0];
    expect(activeRun("job-old", runs, [newest])?.id).toBe("job-old");
    expect(activeRun("job-new", runs, [newest])?.id).toBe("job-new");
  });
  it("falls back to the newest visible run when the chosen one is not here", () => {
    // A link or a stored selection can name a run this browser no longer has:
    // an expired session is served as a status, not as a row. The fallback is
    // then the same one the studio uses with no choice at all.
    expect(activeRun("gone", runs, runs)?.id).toBe("job-new");
    expect(activeRun(null, runs, [])).toBeUndefined();
    // Everything hidden is not a reason to drop a choice the visitor made.
    expect(activeRun("job-old", runs, [])?.id).toBe("job-old");
  });
});

import type { Generator, Job, Source } from "../shared/types";

export interface HeroMedia {
  job?: Job;
  source?: Source;
}

/** What the composer holds, and therefore what the main view has to show. */
export interface HeroState {
  /** Which generator the composer is in. Upscale shows the clip it is upscaling. */
  generator: Generator;
  /** The catalogue clip a Recreate or a title click loaded, if the composer holds one. */
  catalogueId: string | null;
  /** The clip the composer is upscaling, resolved from its own source id. */
  upscale?: Source;
  /** The visitor's run the selection points at, already resolved. */
  selected?: Job;
  /** The visitor's visible runs, so one of their own clips is shown as that run. */
  runs: Job[];
  /** The bundled catalogue clips. */
  samples: Source[];
}

/**
 * The run the screen holds: the one a link or a choice selected, otherwise the
 * newest visible run.
 *
 * An explicit selection survives hiding: the card's action says "Hide from this
 * browser gallery", so hiding filters the gallery and does not give the run up,
 * and the run the composer holds would otherwise be one the main view no longer
 * shows. Only the fallback is drawn from the visible runs.
 *
 * The main view and the composer both take their run from this, so a returning
 * session cannot open showing the newest generated clip over a composer that
 * still holds the opening scene.
 */
export function activeRun(
  selectedId: string | null,
  runs: Job[],
  visible: Job[],
): Job | undefined {
  return runs.find((job) => job.id === selectedId) ?? visible[0];
}

/**
 * What the main view shows, derived from what the composer is operating on
 * rather than kept in step with it: in Upscale, the clip being upscaled; in
 * video, the catalogue clip the visitor loaded, otherwise their selected or
 * newest run, otherwise the first catalogue clip.
 *
 * One decision over one reference, so there is no second piece of state that
 * has to be cleared for the view to follow the composer: a catalogue clip
 * loaded into the composer keeps the view until a run of the visitor's own
 * becomes what the composer holds.
 */
export function heroMedia({
  generator,
  catalogueId,
  upscale,
  selected,
  runs,
  samples,
}: HeroState): HeroMedia {
  if (generator === "image" || generator === "edit") {
    const match = (job: Job) =>
      job.generator === "image" || job.generator === "edit";
    return { job: selected && match(selected) ? selected : runs.find(match) };
  }
  // A song shows only songs; the catalogue holds none.
  if (generator === "audio") {
    const match = (job: Job) => job.generator === "audio";
    return { job: selected && match(selected) ? selected : runs.find(match) };
  }
  // The composer is improving this clip, so it is the run on screen.
  if (generator === "upscale" && upscale) return asRun(upscale, runs);
  const catalogue = catalogueId
    ? samples.find((clip) => clip.id === catalogueId)
    : undefined;
  if (catalogue) return { source: catalogue };
  return selected ? { job: selected } : { source: samples[0] };
}

/**
 * A catalogue clip is presented through `source` and never as a job: its id
 * names an entry in a shipped file, not a row in this browser's session, so
 * showing it as a job would start a poll and a link for something this browser
 * does not own.
 *
 * A generated clip is the opposite case — its id is the session run that made
 * it — so it is shown as that run, with the run's own status, caption and
 * retry, rather than as a catalogue clip that claims to come from the library.
 */
function asRun(clip: Source, runs: Job[]): HeroMedia {
  if (clip.origin !== "generated") return { source: clip };
  const run = runs.find((job) => job.id === clip.id);
  return run ? { job: run } : { source: clip };
}

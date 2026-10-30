import { isH3Router, H3_ROUTER_REFERENCES } from "../comfy/h3-router";
import { takesVideoReferences, videoReferenceLimit } from "../h3";
import { registry } from "../registry";
import { checkMix } from "./mix";
import type { HouseTemplate, RunKind } from "./types";

/**
 * How the gallery's Generate runs a template, as the owner decided on 27
 * October 2026: the gallery is the fast mode and the Director the advanced
 * one, and a template says which way it runs. Nothing here is inferred from
 * the shots; an undeclared template is `agent`, the safe default, because a
 * session quotes each step and asks.
 */
export const RUN_KINDS = [
  "mechanical",
  "agent",
  "mix",
] as const satisfies readonly RunKind[];

export const runKind = (template: Pick<HouseTemplate, "run">): RunKind =>
  template.run ?? "agent";

export const isMechanical = (template: Pick<HouseTemplate, "run">) =>
  runKind(template) === "mechanical";

/**
 * A mix template: a finished edit of bundled media, nothing to generate
 * (added 29 October 2026 for the Dimensions mix). The gallery offers no
 * Generate for it, only opening the cut in the Director or the Editor.
 */
export const isMix = (template: Pick<HouseTemplate, "run">) =>
  runKind(template) === "mix";

/**
 * Refuses a mix template that is not one: it has its cut and the media the
 * cut plays, and no shots, references or tracks, since those describe runs
 * to make and a mix makes none.
 */
export function checkMixTemplate(template: HouseTemplate) {
  const fail = (why: string) => {
    throw new Error(`${template.id} is not a mix: ${why}`);
  };
  if (!isMix(template)) fail("its run is not mix");
  if (!template.mix) fail("it has no cut");
  if (template.shots.length || template.references.length)
    fail("a mix has no shots or references to generate");
  if (template.tracks.length) fail("its lanes come from the cut");
  if (template.mix!.cut.id !== template.id) fail("its cut has another id");
  checkMix(
    template.mix!.cut,
    Object.fromEntries(
      Object.entries(template.mix!.media).map(([id, m]) => [
        id,
        { ...m, sha256: "" },
      ]),
    ),
  );
}

/**
 * Refuses a run kind the template cannot keep. A mechanical template is one
 * generation its recipe fully describes, so the gallery can swap the
 * person's files into it and run it in place:
 *
 * - exactly one shot;
 * - every reference is carried by that shot, is exactly one file, opens with
 *   its own example (the run never waits for an upload) and has no `madeWith`
 *   (nothing is generated before the run). A generation card's start image
 *   is the one exception to the example: until the owner supplies one, the
 *   person drops theirs before Generate can quote;
 * - no audio lane, which needs a cut;
 * - the shot's entry takes that many references (H3 on Router: exactly two).
 *
 * Anything else, a cut, a trim, a track or a step before the run, is an
 * agent template.
 */
export function checkRunKind(template: HouseTemplate) {
  const kind: unknown = template.run;
  if (kind !== undefined && !RUN_KINDS.some((k) => k === kind))
    throw new Error(`${template.id}: run must be mechanical, agent or mix`);
  if (isMix(template))
    throw new Error(`${template.id}: a mix has no runs to plan`);
  if (!isMechanical(template)) return;
  const fail = (why: string) => {
    throw new Error(`${template.id} cannot run mechanically: ${why}`);
  };
  if (template.shots.length !== 1)
    fail(`it has ${template.shots.length} shots, and a run is one`);
  const [shot] = template.shots;
  for (const ref of template.references) {
    if (!shot.references.includes(ref.id))
      fail(`its shot does not carry ${ref.label}`);
    if (ref.min !== 1 || ref.max !== 1)
      fail(`${ref.label} must be exactly one file`);
    if (!ref.example && !template.generation)
      fail(`${ref.label} has no example to open with`);
    if (ref.madeWith) fail(`${ref.label} is made by a step before the run`);
  }
  if (template.tracks.some((t) => t.kind === "audio"))
    fail("an audio lane needs a cut");
  const entry = registry.find((e) => e.id === shot.entry);
  const model = entry && "videoModel" in entry ? entry.videoModel : undefined;
  const count = shot.references.length;
  if (count && !takesVideoReferences(model))
    fail(`${shot.entry} takes no references`);
  if (count > videoReferenceLimit(model))
    fail(
      `${shot.entry} takes at most ${videoReferenceLimit(model)} references`,
    );
  if (isH3Router(model) && count !== H3_ROUTER_REFERENCES)
    fail(`${shot.entry} takes the sheet and the storyboard, two references`);
}

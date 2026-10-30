import { readFileSync } from "node:fs";
import { dimensionsMix } from "../shared/templates/dimensions-mix";
import { buildMixBundle } from "../src/director/mix-template";
import { base } from "./house-template-fixtures";

/** The Dimensions mix media as the Director fetches it from public/. */
export function mixBytes() {
  const out: Record<string, Uint8Array<ArrayBuffer>> = {};
  for (const [id, m] of Object.entries(dimensionsMix.mix!.media))
    out[id] = new Uint8Array(
      readFileSync(new URL(`../public${m.url}`, import.meta.url)),
    );
  return out;
}

/** The template's bundle, built as `/director?example=dimensions-mix` does. */
export const mixBundle = () =>
  buildMixBundle(dimensionsMix, base(), mixBytes());

/**
 * A Dimensions mix as a studio saved it before 30 October 2026 (#221): the
 * end card a 102-frame video on the shots lane (`shot-13`, asset
 * `mix-end`). Any bytes stand in for the old capture, which is no longer in
 * public/: validation checks the hash the project records.
 */
export async function legacyMixBundle() {
  const old = structuredClone(dimensionsMix.mix!.cut);
  old.layers = old.layers.filter((l) => l.id !== "end-card");
  old.shots.push({
    asset: "mix-end",
    label: "End card · produced by Genobi 2026",
    sourceSeconds: 0,
    startBeat: 44,
    beats: 10,
    cropY: null,
  });
  const template = {
    ...dimensionsMix,
    mix: {
      cut: old,
      media: {
        ...dimensionsMix.mix!.media,
        "mix-end": {
          kind: "video" as const,
          url: "/media/director-templates/dimensions-mix/mix-end.mp4" as const,
          path: "media/mix-end.mp4",
          durationSeconds: 102 / 24,
        },
      },
    },
  };
  const bytes = mixBytes();
  return buildMixBundle(template, base(), {
    ...bytes,
    "mix-end": bytes["mix-03"],
  });
}

import type { MixSpec } from "../../../shared/templates/mix";
import type { TemplateMix } from "../../../shared/templates/types";
import media from "../../../docs/genobi-teaser-run/media-v1.json";
import mediaV2 from "../../../docs/genobi-teaser-run/media-v2.json";

/** The run kit reproduces the 720p v1 edit on its original recordings. */
export const isV1 = (cut: MixSpec) =>
  cut.id === "genobi-teaser" && cut.width === 1280 && cut.height === 720;
export const v1Media = media as TemplateMix["media"];
/**
 * The media v2 was cut on (docs/genobi-teaser-run/media-v2.json): teaser v3
 *  replaced several at their paths, so the takes it re-recorded point
 * at their archived bytes in public/media/showcase/genobi-teaser/v2/. The kit
 * reproduces v2, so a run verifies and renders on these.
 */
export const v2Media = mediaV2 as TemplateMix["media"];
/** The media a run cut is checked and packaged on: v1's or v2's. */
export const runMedia = (cut: MixSpec) => (isV1(cut) ? v1Media : v2Media);

/** Explicit compatibility defaults; authored values and the cut stay intact. */
export function currentRecipes(cut: MixSpec): MixSpec {
  if (!isV1(cut)) return cut;
  return {
    ...cut,
    layers: cut.layers.map((layer) => ({
      ...layer,
      ...(["cards", "end"].includes(layer.lane) &&
      ["gen-title", "gen-image", "end-card"].includes(layer.module)
        ? { card: layer.card ?? true }
        : {}),
      parameters: {
        ...(layer.module === "gen-title" ? { plate: 0 } : {}),
        ...(["ui-cursor", "ui-focus"].includes(layer.module)
          ? { view: "" }
          : {}),
        ...layer.parameters,
      },
    })),
  };
}

import type { AspectRatio, GenerateInput, VideoResolution } from "../types";

/**
 * MiniMax H3 through Comfy Router (`minimax/minimax-h3`), checked against
 * docs.comfy.org/router-schemas/minimax/minimax-h3.json (schema version
 * c0e2e941ffff) on 27 October 2026. `content` holds exactly one non-empty text
 * item and optional media items; an `image_url` takes a public URL, an
 * `mm_file://` id or a data URI, and `role: "reference_image"` makes it a
 * reference (reference roles and first/last-frame roles never mix).
 * `resolution` is `768P` or `2K`; `duration` is whole seconds from 4 to 15
 * (MiniMax's own page says 5 to 15); `ratio` is one of six, never `adaptive`
 * without a first frame. The schema names no image size or count limit, so the
 * studio's own reference bounds hold (`server/validate-h3.ts`). The result is
 * `task.content.url`: an MP4 link valid for usually 12 hours (Router's
 * re-host), shorter if Router falls back to MiniMax's own link; there is no
 * route to refresh it.
 *
 * This is the no-guide reference-to-video path; the four Cloud OmniRef
 * entries (`shared/comfy/h3.ts`) stay for guided motion.
 */
export const H3_ROUTER_ROUTE = "minimax/minimax-h3";
export const H3_ROUTER_MODEL = "minimax-h3-router";
export const isH3Router = (model: unknown) => model === H3_ROUTER_MODEL;

export const H3_ROUTER_DURATION = { min: 4, max: 15 } as const;
/** The schema's ratios without `adaptive`: every request here is reference to video. */
export const H3_ROUTER_RATIOS = [
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
] as const satisfies readonly AspectRatio[];
/** The composer's two tiers: HD names `768P`, Full HD names `2K`. */
export const H3_ROUTER_RESOLUTIONS = [
  "hd",
  "fhd",
] as const satisfies readonly VideoResolution[];
export type H3RouterResolution = "768P" | "2K";
export const h3RouterResolution = (
  resolution: VideoResolution,
): H3RouterResolution => (resolution === "hd" ? "768P" : "2K");

/** The character sheet first, the storyboard second, as the teaser prompt names them. */
export const H3_ROUTER_REFERENCES = 2;
/**
 * Comfy partner-node rates (docs.comfy.org/tutorials/partner-nodes/pricing,
 * Minimax section, checked 27 October 2026): MiniMax H3 Reference to Video,
 * credits per second of output, plus 12.07 credits per reference image over
 * five (this entry sends two, so none). Router states no rate of its own; a
 * finished run's `X-Comfy-Credits-Used` is the charge and is recorded on the
 * job, so the first approved run shows whether Router bills the same.
 */
const CREDITS_PER_SECOND: Record<H3RouterResolution, number> = {
  "768P": 27.16,
  "2K": 39.22,
};
export const h3RouterCredits = (
  duration: number,
  resolution: VideoResolution,
) =>
  Math.round(
    duration * CREDITS_PER_SECOND[h3RouterResolution(resolution)] * 100,
  ) / 100;

/**
 * The Router body. `input` is the request as validated, image references still
 * the data URLs the person sent (never the stored hashes). Throws rather than
 * mapping a value the schema refuses: validation has already fitted it.
 */
export function h3RouterBody(
  input: Pick<
    GenerateInput,
    "duration" | "aspectRatio" | "resolution" | "imageReferences"
  >,
  prompt: string,
) {
  const refs = input.imageReferences ?? [];
  if (
    refs.length !== H3_ROUTER_REFERENCES ||
    !refs.every((ref) => /^data:image\/(?:png|jpeg|webp);base64,/.test(ref))
  )
    throw new Error("H3 on Router needs two reference images as data URLs.");
  if (!prompt.trim()) throw new Error("H3 on Router needs a prompt.");
  const { min, max } = H3_ROUTER_DURATION;
  if (
    !Number.isInteger(input.duration) ||
    input.duration < min ||
    input.duration > max
  )
    throw new Error(`H3 on Router takes ${min} to ${max} whole seconds.`);
  if (!(H3_ROUTER_RATIOS as readonly string[]).includes(input.aspectRatio))
    throw new Error("H3 on Router does not take this aspect ratio.");
  if (!(H3_ROUTER_RESOLUTIONS as readonly string[]).includes(input.resolution))
    throw new Error("H3 on Router runs at 768P or 2K.");
  return {
    content: [
      { type: "text", text: prompt },
      ...refs.map((url) => ({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      })),
    ],
    duration: input.duration,
    resolution: h3RouterResolution(input.resolution),
    ratio: input.aspectRatio,
  };
}

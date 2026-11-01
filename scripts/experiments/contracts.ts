import type { AudioTrack } from "../../src/world-builder/audio";
import type { Recipe } from "../../src/world-builder/recipe";

/** Match the native capture decoder before spending time on a local guide. */
export function assertGuideBounds(dimensions: {
  width: number;
  height: number;
  frames: number;
}) {
  const { width, height, frames } = dimensions;
  if (
    ![97, 193].includes(frames) ||
    [width, height].some(
      (n) => !Number.isInteger(n) || n < 256 || n > 1920 || n % 64,
    )
  )
    throw new Error(
      "Pilot guides require 97/193 frames and 256–1920 dimensions divisible by 64.",
    );
  if (width * height * frames * 12 > 2 * 1024 ** 3)
    throw new Error(
      "Guide exceeds the native capture decoder's 2 GiB bound; reduce dimensions.",
    );
}

export function assertAnalysisFrames(
  analysis: Pick<Recipe, "envelope" | "bandEnvelopes">,
  frames: number,
) {
  if (
    [
      analysis.envelope,
      analysis.bandEnvelopes.low,
      analysis.bandEnvelopes.mid,
      analysis.bandEnvelopes.high,
      ...(analysis.bandEnvelopes.sub ? [analysis.bandEnvelopes.sub] : []),
    ].some((data) => data.length !== frames)
  )
    throw new Error(
      "Every analysis envelope must use the exact pilot frame count.",
    );
}

/** The generic companion writer pads short inputs; this pilot forbids padding. */
export function assertAudioExcerpt(track: AudioTrack, frames: number) {
  const samples = frames * 2000; // 48 kHz PCM / 24 fps; duration is frames/fps.
  if (
    track.sampleRate !== 48000 ||
    !track.channels.length ||
    track.channels.length > 2 ||
    track.channels.some((channel) => channel.length !== samples)
  )
    throw new Error(
      `Decoded excerpt must contain exactly ${samples} samples per channel at 48000 Hz; no padding or retiming.`,
    );
  if (!track.bands)
    throw new Error("The pilot requires decoded band analysis.");
  assertAnalysisFrames(
    { envelope: track.envelope, bandEnvelopes: track.bands },
    frames,
  );
}

/** The native boundary measures raw UTF-8 bytes, including any whitespace. */
export function serializeRecipe(recipe: Recipe) {
  const text = JSON.stringify(recipe);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > 64_000)
    throw new Error(
      `Recipe is ${bytes} UTF-8 bytes; the native limit is 64000. Reduce topology or explicitly choose lower precision.`,
    );
  return { text, bytes };
}

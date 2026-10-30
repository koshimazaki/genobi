import { durationRange } from "../shared/controls";
import {
  MUSIC_CAPTION_LIMIT,
  MUSIC_LYRICS_LIMIT,
  MUSIC_MODEL,
} from "../shared/music";
import { entryFor } from "../shared/registry";
import type { GenerateInput } from "../shared/types";
import { AppError } from "./errors";

/** Text a song is sent: no control characters except line breaks and tabs. */
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/**
 * A music request, held to MiniMax Music 3's registry entry: a caption (the
 * description), optional lyrics and a whole number of seconds inside the
 * entry's range. Nothing else is read, so a camera, ratio or source sent with
 * it cannot reach the run or its replay hash; the fields every request carries
 * are filled with the values a song never uses.
 */
export function validateAudio(
  body: Record<string, unknown>,
  revision: { projectRevision?: number },
): GenerateInput {
  const model = body.model ?? MUSIC_MODEL;
  if (model !== MUSIC_MODEL)
    throw new AppError(400, "Music runs on MiniMax Music 3.");
  const controls = entryFor("audio", MUSIC_MODEL).controls;
  if (controls.kind !== "audio")
    throw new AppError(400, "Choose supported music settings.");
  const caption = body.description;
  if (
    typeof caption !== "string" ||
    !caption.trim() ||
    caption.length > MUSIC_CAPTION_LIMIT ||
    CONTROL.test(caption)
  )
    throw new AppError(
      400,
      `Describe the music in under ${MUSIC_CAPTION_LIMIT.toLocaleString("en-US")} characters.`,
    );
  const lyrics = body.lyrics ?? "";
  if (
    typeof lyrics !== "string" ||
    lyrics.length > MUSIC_LYRICS_LIMIT ||
    CONTROL.test(lyrics)
  )
    throw new AppError(
      400,
      `Keep the lyrics under ${MUSIC_LYRICS_LIMIT.toLocaleString("en-US")} characters, or leave them empty.`,
    );
  const range = durationRange(controls.duration);
  if (
    typeof body.duration !== "number" ||
    !Number.isInteger(body.duration) ||
    body.duration < range.min ||
    body.duration > range.max
  )
    throw new AppError(
      400,
      `Choose a whole number of seconds between ${range.min} and ${range.max}.`,
    );
  return {
    generator: "audio",
    model: MUSIC_MODEL,
    description: caption.trim(),
    lyrics: lyrics.trim(),
    cameraEnabled: false,
    duration: body.duration,
    resolution: "hd",
    aspectRatio: "16:9",
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
    ...revision,
  };
}

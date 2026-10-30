/**
 * The languages the local voice model takes as a hint (issue #23). The list
 * is Qwen3-ASR's own: `SUPPORTED_LANGUAGES` in `qwen_asr/inference/utils.py`
 * of qwen-asr 0.0.6, the version server/voice-worker/requirements.txt pins
 * (read 21 October 2026). The model refuses any other name, so the studio,
 * the server and the worker accept only these, or `auto` to let the model
 * detect the language per chunk.
 */
export const VOICE_LANGUAGES = [
  "Chinese",
  "English",
  "Cantonese",
  "Arabic",
  "German",
  "French",
  "Spanish",
  "Portuguese",
  "Indonesian",
  "Italian",
  "Korean",
  "Russian",
  "Thai",
  "Vietnamese",
  "Japanese",
  "Turkish",
  "Hindi",
  "Malay",
  "Dutch",
  "Swedish",
  "Danish",
  "Finnish",
  "Polish",
  "Czech",
  "Filipino",
  "Persian",
  "Greek",
  "Romanian",
  "Hungarian",
  "Macedonian",
] as const;

export type VoiceLanguageName = (typeof VOICE_LANGUAGES)[number];
/** A language name, or `auto`: no hint, the model detects it. */
export type VoiceLanguage = VoiceLanguageName | "auto";

export const AUTO_LANGUAGE = "auto";
/** What the studio picks until the person chooses. */
export const DEFAULT_VOICE_LANGUAGE: VoiceLanguage = "English";
const LONGEST = 20;

export const isVoiceLanguage = (value: unknown): value is VoiceLanguage =>
  typeof value === "string" &&
  value.length <= LONGEST &&
  (value === AUTO_LANGUAGE ||
    (VOICE_LANGUAGES as readonly string[]).includes(value));

/**
 * A request's language: undefined when it names none, otherwise a known
 * value exactly as listed. Throws an Error whose message is safe to show.
 */
export function parseVoiceLanguage(value: unknown): VoiceLanguage | undefined {
  if (value === undefined) return undefined;
  if (!isVoiceLanguage(value))
    throw new Error(
      "Choose a voice language from the list, or auto to detect it.",
    );
  return value;
}

/**
 * The server's default from GENOBI_VOICE_LANGUAGE: a listed name in any case
 * (as Qwen3-ASR normalises it), `auto`, or unset, which means auto. Anything
 * else is undefined, which the server reports as a setup problem.
 */
export function configuredVoiceLanguage(
  value: string | undefined,
): VoiceLanguage | undefined {
  if (!value) return AUTO_LANGUAGE;
  const name =
    value.toLowerCase() === AUTO_LANGUAGE
      ? AUTO_LANGUAGE
      : value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
  return isVoiceLanguage(name) ? name : undefined;
}

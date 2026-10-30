import {
  DEFAULT_VOICE_LANGUAGE,
  isVoiceLanguage,
  type VoiceLanguage,
} from "../../shared/voice-languages";

/**
 * The voice language, remembered per browser. Storage can be missing or
 * refuse (a private window, blocked site data), so every read and write is
 * guarded; a missing or unknown value is English.
 */
export const LANGUAGE_KEY = "genobi.voice.language";

type Store = Pick<Storage, "getItem" | "setItem">;
const local = (): Store | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export function readVoiceLanguage(store = local()): VoiceLanguage {
  try {
    const value = store?.getItem(LANGUAGE_KEY);
    return isVoiceLanguage(value) ? value : DEFAULT_VOICE_LANGUAGE;
  } catch {
    return DEFAULT_VOICE_LANGUAGE;
  }
}

export function saveVoiceLanguage(language: VoiceLanguage, store = local()) {
  try {
    store?.setItem(LANGUAGE_KEY, language);
  } catch {
    // Not remembered; this page still uses it.
  }
}

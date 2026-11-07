import { LOAD_SOUND_NAMES, type LoadSoundName } from "./cues";

export type LoadSoundChoice = LoadSoundName | "off";

/** On, quietly, unless the person picks another cue or turns it off. */
export const DEFAULT_LOAD_SOUND: LoadSoundChoice = "chip";
const KEY = "genobi.loadSound";

/** The remembered cue; the default when none is stored or storage is off. */
export function loadSoundChoice(): LoadSoundChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "off") return "off";
    if (saved && (LOAD_SOUND_NAMES as string[]).includes(saved))
      return saved as LoadSoundName;
  } catch {
    /* Private windows and blocked storage use the default. */
  }
  return DEFAULT_LOAD_SOUND;
}

export function setLoadSoundChoice(choice: LoadSoundChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* Not remembered; this session still uses the default. */
  }
}

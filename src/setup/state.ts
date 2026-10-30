import type { SelectionPreference } from "../../shared/licensing/selection";
import type { UsagePreference } from "../../shared/licensing/types";
import {
  clearUsage,
  readSelection,
  readUsage,
  saveSelection,
  saveUsage,
} from "../licensing/preferences";
import type { HermesFields } from "./SetupHarnesses";

export const OPEN_SETUP = "genobi:open-setup";
export const OPEN_CONNECTION = "genobi:open-connection";
/** A key saved in setup: the detail is the server's `KeysStatus`, never a key. */
export const SERVER_KEYS_CHANGED = "genobi:server-keys-changed";
/** Setup was saved: the studio applies its Open only and Local defaults. */
export const SETUP_SAVED = "genobi:setup-saved";
const seenKey = "genobi-setup-seen-v1";
export interface SetupDraft {
  selection: SelectionPreference;
  usage?: UsagePreference;
  /** Optional voice setup intent; never starts an installation or recording. */
  voice?: boolean;
  /**
   * Where "Save & set up" installs voice; empty means the server's default
   * (`models/` beside the checkout). Not saved.
   */
  voiceFolder?: string;
  /**
   * Which verified model already on this machine to use: undefined for the
   * first one found, null to download a new copy. Not saved.
   */
  voiceModel?: string | null;
  /**
   * Hermes' open model and provider as typed in the Connect step, kept only
   * for a reload in the middle of setup (session-draft.ts); the server saves
   * them on Sign in and Continue. Absent, the step shows the saved choice.
   */
  hermes?: HermesFields;
}
export function setupDraft(): SetupDraft {
  let voice: boolean | undefined;
  try {
    const saved = localStorage.getItem("genobi-setup-voice-v1");
    if (saved === "true" || saved === "false") voice = saved === "true";
  } catch {
    /* Keep setup usable without browser storage. */
  }
  return {
    // A newcomer starts on the open path: Open models only, preselected.
    selection: readSelection() ?? { weights: "open-weights" },
    usage: readUsage(),
    ...(voice === undefined ? {} : { voice }),
  };
}
export function hasSeenSetup() {
  try {
    return (
      localStorage.getItem(seenKey) === "1" ||
      localStorage.getItem("genobi.startup-guide.v1") === "seen"
    );
  } catch {
    return false;
  }
}
export function rememberSetup() {
  try {
    localStorage.setItem(seenKey, "1");
  } catch {
    /* This visit still closes normally without storage. */
  }
}
export function saveSetup(draft: SetupDraft) {
  saveSelection(draft.selection);
  if (draft.usage) saveUsage(draft.usage);
  else clearUsage();
  if (draft.voice !== undefined) {
    try {
      localStorage.setItem("genobi-setup-voice-v1", String(draft.voice));
    } catch {
      /* This visit still closes normally without storage. */
    }
  }
  rememberSetup();
  try {
    window.dispatchEvent(new Event(SETUP_SAVED));
  } catch {
    /* No window (a test or a worker): nothing listens. */
  }
}

/** Guide execution and model openness independently; no implicit cloud fallback. */
export function setupRoute(selection: SelectionPreference) {
  return selection.execution === "local"
    ? "local"
    : selection.execution === "cloud"
      ? "cloud"
      : "mixed";
}

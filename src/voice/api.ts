import { withBrowserActivity } from "../activity/store";
import {
  isVoiceLanguage,
  type VoiceLanguage,
} from "../../shared/voice-languages";

/**
 * The local server's voice routes. The hosted studio has none, so a missing
 * or malformed status reads as "not available here" rather than an error.
 */
export interface VoiceStatus {
  available: boolean;
  maxSeconds: number;
  /** The language hints the server accepts; absent on an older server. */
  languages?: VoiceLanguage[];
  setup?: string;
}

const HOSTED =
  "Voice mode runs on the local Genobi server only; this studio cannot transcribe.";

export async function voiceStatus(signal?: AbortSignal): Promise<VoiceStatus> {
  try {
    const response = await fetch("/api/voice/status", { signal });
    const body = response.ok ? await response.json() : undefined;
    if (typeof body?.available !== "boolean")
      return { available: false, maxSeconds: 0, setup: HOSTED };
    const languages = Array.isArray(body.languages)
      ? body.languages.filter(isVoiceLanguage)
      : [];
    return {
      available: body.available,
      ...(languages.length ? { languages } : {}),
      maxSeconds:
        Number.isFinite(body.maxSeconds) && body.maxSeconds > 0
          ? body.maxSeconds
          : 60,
      ...(typeof body.setup === "string" ? { setup: body.setup } : {}),
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return { available: false, maxSeconds: 0, setup: HOSTED };
  }
}

/** Loads the model while the person speaks; failure only costs the head start. */
export function prewarmVoice() {
  void fetch("/api/voice/prewarm", { method: "POST" }).catch(() => {});
}

/**
 * A discarded recording frees the model its prewarm started loading.
 * `keepalive`, so it still goes when the tab is closing.
 */
export function cancelPrewarm() {
  void fetch("/api/voice/prewarm", { method: "DELETE", keepalive: true }).catch(
    () => {},
  );
}

/**
 * Runs `onHide` when the page is closed, reloaded or put in the back-forward
 * cache. React does not unmount on a closing tab, so the recorder listens
 * here to free its prewarm; returns the cleanup.
 */
export function onPageHide(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  onHide: () => void,
) {
  target.addEventListener("pagehide", onHide);
  return () => target.removeEventListener("pagehide", onHide);
}

export interface Transcript {
  text: string;
  timing?: { totalSeconds?: number; prewarmed?: boolean };
  model?: string;
}

/** Sends the note with the person's language: a listed name, or `auto`. */
async function transcribeImpl(
  wav: Blob,
  signal: AbortSignal,
  language: VoiceLanguage,
): Promise<Transcript> {
  const query = new URLSearchParams({ language });
  const response = await fetch(`/api/voice/transcribe?${query}`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: wav,
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.text !== "string")
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "The local voice worker did not answer.",
    );
  return body;
}

export const transcribe = (...args: Parameters<typeof transcribeImpl>) =>
  withBrowserActivity("voice", () => transcribeImpl(...args));

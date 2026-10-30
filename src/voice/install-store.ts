import { useSyncExternalStore } from "react";
import type { VoiceStatus } from "./api";
import {
  readFoundVoiceModels,
  readVoiceSetup,
  setupRequest,
  type FoundVoiceModel,
  type VoiceInstallState,
  type VoiceSetupInfo,
} from "./setup-api";

/**
 * One voice installation per page, outside any component, so closing setup
 * or the mic panel does not stop the progress reads. A start always asks the
 * server for a fresh confirmation grant first; the confirming click (setup's
 * "Save & set up" or the panel's "Yes, install Voice Mode") is the caller.
 * When the install reaches Ready, the model is prewarmed and VOICE_READY tells
 * the mic and the status lines to read voice status again.
 */
export const VOICE_READY = "genobi:voice-ready";
export interface VoiceInstallSnapshot {
  /** The last grant read: model name, size and default folder. */
  info?: VoiceSetupInfo;
  state?: VoiceInstallState;
  /** A start or cancel request is in flight. */
  pending: boolean;
  error: string;
  /**
   * Verified models already on this machine: undefined until looked for,
   * so nothing offers a download before the search has answered.
   */
  found?: FoundVoiceModel[];
  searching?: boolean;
}
let snapshot: VoiceInstallSnapshot = { pending: false, error: "" };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
function update(next: Partial<VoiceInstallSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}
export const voiceInstall = () => snapshot;
export function subscribeVoiceInstall(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export function useVoiceInstall() {
  return useSyncExternalStore(
    subscribeVoiceInstall,
    voiceInstall,
    voiceInstall,
  );
}

/** Takes a status the panel already read, and follows it if it is running. */
export function adoptVoiceInstall(info: VoiceSetupInfo) {
  update({ info, state: info.state });
  follow(info.state);
}

/**
 * Reads the installer's prerequisites (Python 3.11, ffmpeg) for setup. The
 * read only mints a grant; nothing installs until a confirming click.
 */
export async function checkVoiceInstall(signal?: AbortSignal) {
  if (snapshot.pending) return;
  try {
    const info = await readVoiceSetup(signal);
    if (!snapshot.pending) adoptVoiceInstall(info);
  } catch (error) {
    if ((error as Error).name !== "AbortError")
      update({ error: (error as Error).message });
  }
}

/**
 * What the header mic shows: the install panel while voice is not set up, the
 * recorder (which asks for the microphone) once the last status read says it is.
 */
export function micPanel(open: boolean, status: VoiceStatus | undefined) {
  if (!open) return undefined;
  return status && !status.available ? "setup" : "recorder";
}

/**
 * Calls `reread` when an install finishes, unless `showing()` says a panel is
 * open on it: that panel offers "Start using Voice Mode" itself, and swapping
 * in the recorder would ask for the microphone before the mic is pressed.
 */
export function onVoiceReady(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  reread: () => void,
  showing: () => boolean = () => false,
) {
  const handler = () => {
    if (!showing()) reread();
  };
  target.addEventListener(VOICE_READY, handler);
  return () => target.removeEventListener(VOICE_READY, handler);
}

/**
 * Looks for a verified Qwen3-ASR-0.6B on this machine (`GET
 * /api/voice/setup/found`) before any download is offered. A failed search
 * reads as none found, so "Install new" still works. One search per page at a
 * time, not tied to any panel: a caller that arrives while it runs (setup's
 * Save & set up, say) waits for the same answer, and closing a panel does not
 * cut it short.
 */
let search: Promise<void> | undefined;
export function findVoiceModels() {
  search ??= (async () => {
    update({ searching: true });
    try {
      update({ found: await readFoundVoiceModels() });
    } catch {
      update({ found: [] });
    } finally {
      update({ searching: false });
      search = undefined;
    }
  })();
  return search;
}

/**
 * The confirmed start: a fresh grant, then the install with `confirmed: true`.
 * `model` adopts one of the verified models the search found ("Use this
 * one"): it is linked into the new install instead of downloaded.
 */
export async function startVoiceInstall(folder?: string, model?: string) {
  if (snapshot.pending || snapshot.state?.busy) return;
  update({ pending: true, error: "" });
  try {
    const info = await readVoiceSetup();
    update({ info, state: info.state });
    if (!info.supported) throw new Error(info.reason);
    const state = await setupRequest<VoiceInstallState>("", "POST", {
      token: info.token,
      folder: folder?.trim() || info.folder,
      confirmed: true,
      ...(model ? { model } : {}),
    });
    update({ state });
    follow(state);
  } catch (error) {
    update({ error: (error as Error).message });
  } finally {
    update({ pending: false });
  }
}

/** Stops a running install; the server removes this attempt's files. */
export async function cancelVoiceInstall() {
  if (snapshot.pending) return;
  update({ pending: true });
  try {
    const state = await setupRequest<VoiceInstallState>("", "DELETE");
    update({ state, error: "" });
  } catch (error) {
    update({ error: (error as Error).message });
  } finally {
    update({ pending: false });
  }
}

function follow(state: VoiceInstallState) {
  clearTimeout(timer);
  if (state.busy) timer = setTimeout(poll, 800);
}
async function poll() {
  try {
    const next = await setupRequest<VoiceInstallState>("/progress");
    update({ state: next, error: "" });
    if (next.busy) timer = setTimeout(poll, 1200);
    else if (next.phase === "ready") await connected();
  } catch {
    update({ error: "Connection lost. Reconnecting to setup…" });
    timer = setTimeout(poll, 3000);
  }
}
/** Prewarm, then let every voice surface read the new status. */
async function connected() {
  await fetch("/api/voice/prewarm", { method: "POST" }).catch(() => {});
  window.dispatchEvent(new Event(VOICE_READY));
}

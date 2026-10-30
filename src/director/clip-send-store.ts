import { useSyncExternalStore } from "react";
import type { Note } from "./useAgentSend";

/**
 * What this page has sent to Genobi per clip, for the clip inspector's
 * "Sent to Genobi · 14:05": the time and the words sent, kept for this page
 * only (a reload forgets it; the agent's own record is the project memory).
 * The clip's latest Send note (busy, refused) sits beside it, so the
 * inspector header's button and the line under the Prompt field agree.
 */
export interface ClipSendState {
  sentAt?: Date;
  /** The prompt as it was sent, to say when the field has changed since. */
  sentWords?: string;
  note?: Note;
}

let state = new Map<string, ClipSendState>();
const listeners = new Set<() => void>();
const key = (projectId: string, layerId: string) => `${projectId}/${layerId}`;

function update(projectId: string, layerId: string, patch: ClipSendState) {
  const id = key(projectId, layerId);
  state = new Map(state).set(id, { ...state.get(id), ...patch });
  listeners.forEach((listener) => listener());
}

/** Records a send of these clips' words now. */
export function markClipsSent(
  projectId: string,
  clips: { id: string; prompt?: string }[],
  at = new Date(),
) {
  for (const clip of clips) {
    // A refusal from an earlier Send no longer applies; the outcome stays.
    const note = clipSendState(projectId, clip.id)?.note;
    update(projectId, clip.id, {
      sentAt: at,
      sentWords: clip.prompt ?? "",
      note: note?.alert ? undefined : note,
    });
  }
}

export function setClipNote(projectId: string, layerId: string, note: Note) {
  update(projectId, layerId, { note });
}

export function clipSendState(projectId: string, layerId: string) {
  return state.get(key(projectId, layerId));
}

/** Forgets every clip (tests). */
export function resetClipSends() {
  state = new Map();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function useClipSend(projectId: string, layerId: string) {
  return useSyncExternalStore(
    subscribe,
    () => clipSendState(projectId, layerId),
    () => undefined,
  );
}

/** "14:05", the person's local time. */
export const clock = (at: Date) =>
  `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

import { useEffect, useRef } from "react";
import { isImage } from "../../shared/image";
import { entryLabel, type ReadyEntry } from "../../shared/registry";
import {
  parseVoiceIntent,
  resolveVoiceIntent,
  type VoiceIntent,
} from "../../shared/voice-intent";
import type { ShellState } from "../studio/ShellContext";
import type { ComposerState } from "../useComposer";

/**
 * Where a spoken generation request lands (issue #23): the Camera composer,
 * through the same `update` its own controls use, so the model menu, the
 * controls it fits and the restore guard all see an ordinary edit. The
 * composer registers itself; voice asks it. Nothing here submits: the
 * request stops at a filled prompt and the priced Generate button.
 */
export interface AppliedIntent {
  entry: ReadyEntry;
  /** The menu line of what was selected: "FLUX 3 Image Klein · Image". */
  label: string;
  subject: string;
}
type Target = (intent: VoiceIntent) => AppliedIntent | null;
let target: Target | undefined;

/** The prompt limits of the fields the subject goes into. */
const LIMIT = { image: 4000, video: 1200 } as const;

/** What the composer becomes for a request, or null when nothing fits. */
export function voiceIntentPatch(intent: VoiceIntent, state: ComposerState) {
  const entry = resolveVoiceIntent(intent, state);
  if (!entry) return null;
  const limit = isImage(entry.generator) ? LIMIT.image : LIMIT.video;
  const patch: Partial<ComposerState> = {
    generator: entry.generator,
    model: entry.videoModel,
    description: intent.subject.slice(0, limit),
  };
  return { entry, patch };
}

/** The composer's side: read its state, apply through its own update. */
export function composerIntentTarget(
  read: () => ComposerState,
  update: (patch: Partial<ComposerState>) => void,
): Target {
  return (intent) => {
    const next = voiceIntentPatch(intent, read());
    if (!next) return null;
    update(next.patch);
    return {
      entry: next.entry,
      label: entryLabel(next.entry),
      subject: next.patch.description!,
    };
  };
}

/** Registers a target; returns the cleanup. The newest registration wins. */
export function onVoiceIntent(next: Target) {
  target = next;
  return () => {
    if (target === next) target = undefined;
  };
}

/**
 * Applies a transcript that reads as a generation request: the composer
 * takes the mode, model and subject, and the shell opens Camera if the
 * composer is not on screen. Null when the words are not a request, no
 * composer is mounted, no model fits, or reading the words fails; the
 * caller then fills the prompt on screen or offers a session, as before.
 */
export function applyVoiceIntent(
  text: string,
  shell?: Pick<ShellState, "visible" | "select"> | null,
): AppliedIntent | null {
  let applied: AppliedIntent | null;
  try {
    const intent = parseVoiceIntent(text);
    applied = intent && target ? target(intent) : null;
  } catch {
    // A fault in reading the words must not take the studio down: the
    // caller fills the prompt on screen with them instead. The words are
    // not logged.
    return null;
  }
  if (applied && shell && !shell.visible.includes("composer"))
    shell.select("camera");
  return applied;
}

/** Called once by `useComposer`, so the composer on screen is the target. */
export function useVoiceIntentTarget(
  state: ComposerState,
  update: (patch: Partial<ComposerState>) => void,
) {
  const latest = useRef({ state, update });
  useEffect(() => {
    latest.current = { state, update };
  });
  useEffect(
    () =>
      onVoiceIntent(
        composerIntentTarget(
          () => latest.current.state,
          (patch) => latest.current.update(patch),
        ),
      ),
    [],
  );
}

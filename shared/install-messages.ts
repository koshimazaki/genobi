/**
 * What setup says while an install waits: the welcome first, then short
 * fixed sentences about what is being installed, what it does and what the
 * mode will feel like, one at a time (`src/setup/InstallWait.tsx`). Fixed
 * text, no model call. Each sentence states documented behaviour
 * (docs/voice-setup.md, docs/voice-mode.md, docs/agent-setup.md,
 * docs/agent-sessions.md); none reports progress, which only the installer
 * does.
 */
import { WELCOME } from "./welcome";

export type InstallKind = "voice" | "hermes";

/** Voice mode: Qwen3-ASR and its runtime (`server/voice-install.ts`). */
export const VOICE_MESSAGES = [
  "This installs Qwen3-ASR, a speech-to-text model, and the Python runtime that runs it.",
  "Voice mode works like this: you press the mic and speak, and a local model writes down what you said.",
  "Your recording never leaves this machine. Only the text goes where you send it.",
  "The words go into the prompt on screen, or to your agent. You can correct them, and nothing runs until you press Generate.",
  "The model is about 1.9 GB. When a checked copy is already on this machine, it is used instead of a download.",
  "You can close this window. The install keeps going, and the mic in the header shows where it is.",
  "Your browser asks for the microphone the first time you press the mic, not before.",
] as const;

/** Hermes' `genobi` profile (`server/agent-hermes-profile-setup.ts`). */
export const HERMES_MESSAGES = [
  "This sets up a Hermes profile called genobi: its own settings, the Genobi plugin and tools, and the open model you chose.",
  "A session is one conversation with your agent about the project in front of you. The mic or a project prompt starts one.",
  "In a session Hermes works your project with the Genobi tools, the same camera, Director and generation tools you use.",
  "Anything that costs money is quoted first and waits for your approval. An agent cannot spend on its own.",
  "Hermes runs on this machine; the open model answers through the provider you signed in to.",
  "Nothing to restart: the next session reads the new profile.",
] as const;

/** The sentences one install shows, the welcome first. */
export function installMessages(kind: InstallKind): readonly string[] {
  return [WELCOME, ...(kind === "voice" ? VOICE_MESSAGES : HERMES_MESSAGES)];
}

/**
 * The message after `index`. The welcome shows once; after the last
 * sentence the install's own sentences start again, for a long download.
 */
export function nextMessage(index: number, count: number): number {
  if (count < 2) return 0;
  return index + 1 < count ? index + 1 : 1;
}

/** Milliseconds a sentence stays: a reading pace, between 6 and 30 seconds. */
export function messageHold(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(30_000, Math.max(6_000, words * 300));
}

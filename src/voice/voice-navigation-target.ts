/**
 * "Open the director", "show camera", "go to the 3D": the studio's own
 * workspace names (the navigation's `presets`), switched with the shell's
 * `select`, before a note goes to the agent or the Camera reading. Only a
 * whole-utterance "open <workspace>" counts (`voiceNavigation`).
 */
import {
  voiceNavigation,
  type VoiceWorkspace,
} from "../../shared/voice-navigation";
import { presets, type Preset } from "../studio/presets";
import type { ShellState } from "../studio/ShellContext";

/** Names said for a workspace besides its label. */
const ALSO: Partial<Record<Preset, readonly string[]>> = {
  world: ["world", "world builder", "3d world", "three d"],
  dual: ["swords", "dual"],
  tools: ["tools"],
};

export const VOICE_WORKSPACES: readonly VoiceWorkspace<Preset>[] = presets.map(
  (p) => ({ id: p.id, names: [p.label, ...(ALSO[p.id] ?? [])] }),
);

/** The workspace these words open, or null. */
export const navigationFor = (words: string) =>
  voiceNavigation(words, VOICE_WORKSPACES);

/** Switches the studio when the words ask to; the label it opened, or null. */
export function applyVoiceNavigation(
  words: string,
  shell: Pick<ShellState, "select"> | null,
) {
  const id = shell ? navigationFor(words) : null;
  if (!shell || !id) return null;
  shell.select(id);
  return presets.find((p) => p.id === id)!.label;
}

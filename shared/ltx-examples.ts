/**
 * Complete example lines for each LTX gap, written for this studio and
 * labelled so, to insert and reuse. They follow the LTX-2.5 prompt guide's
 * rules (https://ltx.io/blog/ltx-2-5-prompt-guide, 10 August 2026): present
 * tense, action as a sequence, emotion as physical cues, dialogue in
 * quotation marks.
 *
 * Each entry has room for an example clip, the way the camera terms have
 * studio examples. None has been generated, since that is a paid run, so
 * every `clip` is null until one is made and reviewed.
 */
import type { SlotId } from "./ltx-prompt";

export interface ExampleClip {
  /** Served from this app's origin, as every playable example is. */
  url: string;
  poster?: string;
  /** The take that made it, so the clip can be recreated. */
  takeId?: string;
}
export interface PromptExample {
  id: string;
  label: string;
  text: string;
  source: "studio";
  clip: ExampleClip | null;
}

const example = (id: string, label: string, text: string): PromptExample => ({
  id,
  label,
  text,
  source: "studio",
  clip: null,
});

export const ltxExamples: Record<SlotId, readonly PromptExample[]> = {
  scene: [
    example(
      "scene-workshop",
      "Night workshop",
      "A cluttered workshop at night, rough stone walls and smooth metal tools under a single hanging bulb, dust drifting through the light.",
    ),
    example(
      "scene-street",
      "Wet street",
      "A narrow street after rain, glossy cobblestones reflecting shop signs, an intimate space hemmed in by old brick walls.",
    ),
    example(
      "scene-desert",
      "Open desert",
      "An expansive desert at dawn, wind-rippled sand under a pale sky, with fine film grain.",
    ),
  ],
  character: [
    example(
      "character-mechanic",
      "Mechanic",
      "A woman in her forties with a grey ponytail, wearing oil-stained overalls and round wire glasses, jaw clenched in concentration.",
    ),
    example(
      "character-boy",
      "Boy at the window",
      "A boy of about eight with curly red hair, wearing a knitted scarf, freckles across his nose, eyes widening as he leans closer.",
    ),
    example(
      "character-guard",
      "Night guard",
      "An elderly man with a shaved head, wearing a worn leather jacket, shoulders dropping as he lets out a long breath.",
    ),
  ],
  action: [
    example(
      "action-letter",
      "Opening a letter",
      "Initially, she turns the envelope over in her hands. A moment later, she tears it open and unfolds the letter, her breath catching.",
    ),
    example(
      "action-run",
      "Run and stop",
      "He runs along the platform as the doors begin to close, then comes to a sudden stop, chest heaving.",
    ),
    example(
      "action-pour",
      "Slow pour",
      "In slow motion, coffee pours into a white cup, the surface rippling as steam rises.",
    ),
  ],
  audio: [
    example(
      "audio-cafe",
      "Café line",
      'Coffeeshop noise fills the room, cups clinking. She whispers, "Not here."',
    ),
    example(
      "audio-storm",
      "Storm outside",
      "Wind and rain lash the windows while a low piano melody plays in the next room.",
    ),
    example(
      "audio-radio",
      "Radio call",
      'A distorted radio-style voice crackles, "All units, hold your position."',
    ),
  ],
};

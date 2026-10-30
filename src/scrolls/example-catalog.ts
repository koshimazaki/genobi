import { ninjaRooms } from "./ninja-storyboard";

export interface ScrollExample {
  name: string;
  file: string;
  made: string;
  /** A World Builder capture rather than an AI-generated sheet. */
  capture?: boolean;
  plan?: {
    prompt: string;
    shots: readonly (readonly [string, string, string])[];
    /**
     * Per panel, in shot order: its text, its first frame under /scrolls/
     * (loaded as that panel's own reference) and the recipe it was captured
     * from.
     */
    panels?: readonly { prompt: string; frame: string; recipe: string }[];
  };
}
const OPENAI = "OpenAI's image API";
export const scrollExamples: readonly ScrollExample[] = [
  {
    name: "Creature · action studies",
    file: "creature-action.png",
    made: OPENAI,
  },
  { name: "Character · views & poses", file: "character.png", made: OPENAI },
  { name: "AEGIS-01 · mecha study", file: "mecha-one.png", made: OPENAI },
  { name: "NOX-01 · mecha study", file: "mecha-two.png", made: OPENAI },
  {
    name: "Sky Gate · eight-shot storyboard",
    file: "storyboard.png",
    made: OPENAI,
    plan: {
      prompt:
        "Dark guardian mecha orbits a sacred alien island gate, lands, and collapses the portal. Eight illustrated storyboard panels.",
      shots: [
        ["Sky gate reveal", "Track right", "Forward"],
        ["Island orbit", "Arc move", "Arc path"],
        ["Front lock", "Orbit clockwise", "Hold"],
        ["Statue rush", "Track right", "Accelerate"],
        ["Thruster flare", "Crane down", "Drop"],
        ["Stone burst", "Locked", "Impact"],
        ["Spell form", "Locked", "Loop / charge"],
        ["Portal collapse", "Crane up", "Release / settle"],
      ],
    },
  },
  {
    name: "Simple creature · views & details",
    file: "creature.png",
    made: "FLUX.3 through BFL's API",
  },
  {
    name: "Rooftop Escape · eight-shot storyboard",
    file: "rooftop-escape.png",
    made: OPENAI,
    plan: {
      prompt:
        "Two ninjas fight across moonlit tiled rooftops, break away, leap between buildings and escape into the night. Black-and-white ink storyboard, eight panels.",
      shots: [
        ["Standoff", "Locked", "Face off"],
        ["Approach", "Track right", "Run"],
        ["Clash", "Push in", "Block"],
        ["Evade", "Low pan", "Duck / kick"],
        ["Break away", "Overhead arc", "Turn / run"],
        ["Leap", "Track right", "Jump"],
        ["Pursuit", "Follow", "Vault"],
        ["Escape", "Pull back", "Exit"],
      ],
    },
  },
  ninjaRooms,
];

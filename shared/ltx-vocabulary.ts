/**
 * Example vocabulary for the four LTX gaps. Where Lightricks' LTX-2.5 prompt
 * guide (https://ltx.io/blog/ltx-2-5-prompt-guide, 10 August 2026) has a list,
 * the chip labels are its terms, verbatim, under its own headings
 * (`source: "guide"`); the phrase a chip inserts is the studio's. The guide
 * gives Character no list, so that set is studio-authored and labelled so,
 * written to its rule: age, hairstyle, clothing, distinguishing features, and
 * emotion through physical cues, never a label such as "sad".
 *
 * A chip inserts; it never replaces what the gap holds (`insertChip`).
 */
import { SLOT_LIMIT, type SlotId } from "./ltx-prompt";

/**
 * How a chip's phrase joins the text before it: a `fragment` after a comma
 * ("rough stone surfaces"), a `verb` after a space ("walks toward"), and a
 * `sentence` or sentence `starter` after a full stop ("Initially, ").
 */
export type ChipJoin = "fragment" | "verb" | "sentence" | "starter";
export interface VocabularyChip {
  label: string;
  phrase: string;
}
export interface VocabularyGroup {
  id: string;
  label: string;
  /** The guide's own list, or written for this studio. */
  source: "guide" | "studio";
  join: ChipJoin;
  chips: readonly VocabularyChip[];
}

const chips = (pairs: readonly (readonly [string, string])[]) =>
  pairs.map(([label, phrase]) => ({ label, phrase }));
const style = (labels: readonly string[]) =>
  chips(labels.map((label) => [label, `${label.toLowerCase()} style`]));

export const ltxVocabulary: Record<SlotId, readonly VocabularyGroup[]> = {
  scene: [
    {
      id: "textures",
      label: "Textures",
      source: "guide",
      join: "fragment",
      chips: chips([
        ["Rough stone", "rough stone surfaces"],
        ["Smooth metal", "smooth metal surfaces"],
        ["Worn fabric", "worn fabric"],
        ["Glossy surfaces", "glossy surfaces"],
      ]),
    },
    {
      id: "scale",
      label: "Scale Indicators",
      source: "guide",
      join: "fragment",
      chips: chips([
        ["Expansive", "an expansive space"],
        ["Epic", "an epic scale"],
        ["Intimate", "an intimate space"],
        ["Claustrophobic", "a claustrophobic space"],
      ]),
    },
    {
      id: "animation",
      label: "Animation",
      source: "guide",
      join: "fragment",
      chips: chips([
        ["Stop-motion", "stop-motion animation"],
        // The guide's "2D / 3D animation", one chip each.
        ["2D animation", "2D animation"],
        ["3D animation", "3D animation"],
        ["Claymation", "claymation"],
        ["Hand-drawn", "hand-drawn animation"],
      ]),
    },
    {
      id: "stylized",
      label: "Stylized",
      source: "guide",
      join: "fragment",
      chips: [
        ...style(["Comic book", "Cyberpunk"]),
        { label: "8-bit pixel", phrase: "8-bit pixel art" },
        ...style(["Surreal", "Minimalist", "Painterly", "Illustrated"]),
      ],
    },
    {
      id: "cinematic",
      label: "Cinematic",
      source: "guide",
      join: "fragment",
      chips: style([
        "Period drama",
        "Film noir",
        "Fantasy",
        "Epic space opera",
        "Thriller",
        "Modern romance",
        "Experimental film",
        "Arthouse",
        "Documentary",
      ]),
    },
    {
      id: "film",
      label: "Film Characteristics",
      source: "guide",
      join: "fragment",
      chips: chips([
        ["Film grain", "film grain"],
        ["Lens flares", "lens flares"],
        ["Pixelated edges", "pixelated edges"],
        ["Jittery stop-motion", "jittery stop-motion"],
      ]),
    },
  ],
  character: [
    {
      id: "age",
      label: "Age",
      source: "studio",
      join: "fragment",
      chips: chips([
        ["Child", "a child of about eight"],
        ["Twenties", "a woman in her twenties"],
        ["Forties", "a man in his forties"],
        ["Elderly", "an elderly woman"],
      ]),
    },
    {
      id: "hair",
      label: "Hairstyle",
      source: "studio",
      join: "fragment",
      chips: chips([
        ["Short dark hair", "with short dark hair"],
        ["Grey ponytail", "with a grey ponytail"],
        ["Curly red hair", "with curly red hair"],
        ["Shaved head", "with a shaved head"],
      ]),
    },
    {
      id: "clothing",
      label: "Clothing",
      source: "studio",
      join: "fragment",
      chips: chips([
        ["Yellow raincoat", "wearing a yellow raincoat"],
        ["Leather jacket", "wearing a worn leather jacket"],
        ["White shirt", "wearing a crisp white shirt"],
        ["Knitted scarf", "wearing a knitted scarf"],
      ]),
    },
    {
      id: "features",
      label: "Distinguishing features",
      source: "studio",
      join: "fragment",
      chips: chips([
        ["Scarred brow", "a scar across one eyebrow"],
        ["Wire glasses", "round wire glasses"],
        ["Freckles", "freckles across the nose"],
        ["Nose ring", "a silver nose ring"],
      ]),
    },
    {
      id: "cues",
      label: "Physical cues",
      source: "studio",
      join: "fragment",
      chips: chips([
        ["Jaw clenched", "jaw clenched"],
        ["Shoulders drop", "shoulders drop"],
        ["Eyes widen", "eyes widen"],
        ["Hands tremble", "hands tremble"],
        ["Slow smile", "a slow smile spreads"],
        ["Breath catches", "breath catches"],
      ]),
    },
  ],
  action: [
    {
      id: "sequence",
      label: "Sequence",
      source: "guide",
      join: "starter",
      chips: chips([
        ["Initially…", "Initially, "],
        ["A moment later…", "A moment later, "],
        ["Simultaneously…", "Simultaneously, "],
      ]),
    },
    {
      id: "verbs",
      label: "Motion verbs",
      source: "studio",
      join: "verb",
      chips: chips([
        ["walks toward", "walks toward"],
        ["turns to face", "turns to face"],
        ["reaches for", "reaches for"],
        ["steps back", "steps back"],
        ["lifts", "lifts"],
        ["pauses", "pauses"],
      ]),
    },
    {
      // The composer writes one continuous take, so Rapid cuts (a multi-shot
      // term) is left out.
      id: "pacing",
      label: "Pacing & Temporal Effects",
      source: "guide",
      join: "fragment",
      chips: chips([
        ["Slow motion", "in slow motion"],
        ["Time-lapse", "in time-lapse"],
        ["Lingering shot", "in a lingering shot"],
        ["Continuous shot", "in one continuous shot"],
        ["Freeze-frame", "ending on a freeze-frame"],
        ["Fade-in / fade-out", "fading in from black"],
        ["Seamless transition", "in a seamless transition"],
        ["Sudden stop", "coming to a sudden stop"],
      ]),
    },
  ],
  audio: [
    {
      id: "ambient",
      label: "Ambient Settings",
      source: "guide",
      join: "fragment",
      chips: chips([
        ["Coffeeshop noise", "coffeeshop noise"],
        ["Wind and rain", "wind and rain"],
        ["Forest ambience with birds", "forest ambience with birds"],
      ]),
    },
    {
      id: "dialogue",
      label: "Dialogue Style",
      source: "guide",
      join: "fragment",
      chips: chips([
        ["Energetic announcer", "an energetic announcer's voice"],
        ["Resonant voice with gravitas", "a resonant voice with gravitas"],
        ["Distorted radio-style", "a distorted radio-style voice"],
        ["Robotic monotone", "a robotic monotone voice"],
        ["Childlike curiosity", "a voice full of childlike curiosity"],
      ]),
    },
    {
      // The guide: "Place spoken dialogue in quotation marks".
      id: "volume",
      label: "Volume",
      source: "guide",
      join: "sentence",
      chips: chips([
        ["Whisper", 'A voice whispers, "…"'],
        ["Mutter", 'A voice mutters, "…"'],
        ["Shout", 'A voice shouts, "…"'],
        ["Scream", 'A voice screams, "…"'],
      ]),
    },
  ],
};

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Adds a chip's phrase to the end of a gap's text, joined as its group says.
 * What was there stays, word for word: a chip inserts, it never replaces.
 */
export function insertChip(text: string, phrase: string, join: ChipJoin) {
  const before = text.replace(/\s+$/, "");
  if (!before) return join === "verb" ? phrase : capitalise(phrase);
  const closed = /[.!?…"'”’)\]]$/.test(before);
  if (join === "sentence" || join === "starter")
    return `${before}${closed ? "" : "."} ${phrase}`;
  if (join === "verb" || /[,;:]$/.test(before)) return `${before} ${phrase}`;
  return closed ? `${before} ${capitalise(phrase)}` : `${before}, ${phrase}`;
}

/**
 * What a chip would make of a gap, and whether that still fits the gap's
 * limit. A chip that would not fit is offered disabled, since the textarea's
 * own `maxLength` does not see text a chip inserts.
 */
export function chipInsertion(text: string, phrase: string, join: ChipJoin) {
  const next = insertChip(text, phrase, join);
  return { text: next, fits: next.length <= SLOT_LIMIT };
}

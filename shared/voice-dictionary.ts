/**
 * Voice mode's words: what the transcriber hears and what the studio writes.
 * Adapted from X Console's voice dictionary. Two effects per transcription:
 * the written words go to Qwen3-ASR as context, which biases recognition
 * towards them, and every heard word or phrase is replaced here, after the
 * model, whole words only, ignoring case, in one pass.
 *
 * Three findings carried over from X Console (20 October 2026):
 * - The context is a word list, not an instruction channel; rules written in
 *   it do nothing, so numbers are normalised here, deterministically.
 * - On a chunk with no speech the model copies the context back word for word;
 *   the server gates silence first and `stripContextEcho` drops what slips by.
 * - A vocabulary word (empty `heard`) only biases; nothing is replaced.
 *
 * Portable: no Node or DOM APIs.
 */
export interface VoiceEntry {
  /** What the model writes when it mishears; empty for a vocabulary word. */
  heard: string;
  /** What the studio writes instead. */
  written: string;
}

/**
 * The studio's own words. The heard variants are seeded guesses at plausible
 * mishearings, not measured ones; extend them from real transcripts. Common
 * words that are also names (Comfy, Ninja) are vocabulary only, so "a comfy
 * sofa" is left alone.
 */
export const STUDIO_DICTIONARY: readonly VoiceEntry[] = [
  { heard: "", written: "Genobi" },
  { heard: "Genoby", written: "Genobi" },
  { heard: "Jenobi", written: "Genobi" },
  { heard: "Gen obi", written: "Genobi" },
  { heard: "", written: "Ninja" },
  { heard: "", written: "Klein" },
  { heard: "Kline", written: "Klein" },
  { heard: "", written: "LTX" },
  { heard: "L T X", written: "LTX" },
  { heard: "el tee ex", written: "LTX" },
  { heard: "", written: "AKUSPACE" },
  { heard: "aku space", written: "AKUSPACE" },
  { heard: "akuspace", written: "AKUSPACE" },
  { heard: "acu space", written: "AKUSPACE" },
  { heard: "", written: "Comfy" },
  { heard: "comfy UI", written: "ComfyUI" },
  { heard: "comfy cloud", written: "Comfy Cloud" },
];

const CONTEXT_LIMIT = 1500;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOT_WORD = "(?<![\\p{L}\\p{N}])";
const NOT_WORD_AFTER = "(?![\\p{L}\\p{N}])";

/** The model's context: each written word once, in the order listed. */
export function dictionaryContext(entries: readonly VoiceEntry[]): string {
  const seen = new Set<string>();
  const words = entries
    .map((entry) => entry.written)
    .filter((word) => {
      const key = word.toLowerCase();
      return !seen.has(key) && seen.add(key);
    });
  return words.join(", ").slice(0, CONTEXT_LIMIT);
}

/**
 * Replaces every heard word or phrase. The longest phrase wins where two
 * overlap, and a replacement is never replaced again. Words of a phrase match
 * across spaces or hyphens.
 */
export function applyDictionary(
  text: string,
  entries: readonly VoiceEntry[],
): string {
  const rules = entries
    .filter((entry) => entry.heard.trim())
    .sort((a, b) => b.heard.length - a.heard.length);
  if (!rules.length || !text) return text;
  const alternatives = rules.map(
    (rule) =>
      `(${rule.heard.trim().split(/\s+/).map(escape).join("[\\s\\-]+")})`,
  );
  const pattern = new RegExp(
    `${NOT_WORD}(?:${alternatives.join("|")})${NOT_WORD_AFTER}`,
    "giu",
  );
  return text.replace(pattern, (...match: unknown[]) => {
    const group = match.slice(1, rules.length + 1).findIndex((g) => g);
    return group < 0 ? String(match[0]) : rules[group].written;
  });
}

/**
 * A chunk that is only a list of two or more dictionary words is the model
 * echoing its context, so it becomes empty; such a list of three or more
 * after a sentence's end is cut off. A word said inside a sentence is kept.
 */
export function stripContextEcho(text: string, context: string): string {
  const terms = context
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!terms.length || !text) return text;
  const term = `(?:${terms.map(escape).join("|")})`;
  const run = (least: number) =>
    `${term}(?:\\s*,\\s*${term}){${least - 1},}[\\s.,!?]*`;
  if (new RegExp(`^${run(Math.min(2, terms.length))}$`, "iu").test(text))
    return "";
  return text.replace(new RegExp(`(?<=[.!?])\\s+${run(3)}$`, "iu"), "");
}

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
/** A lone small number becomes a digit only before one of these. */
const UNIT_WORDS = new Set(
  "second seconds sec secs frame frames fps degree degrees percent mm millimetre millimetres millimeter millimeters k".split(
    " ",
  ),
);

type Kind = "unit" | "teen" | "tens" | "hundred" | "thousand";
/** Which kind of number word may follow which; "" is the start of a phrase. */
const FOLLOWS: Record<Kind, readonly (Kind | "")[]> = {
  unit: ["", "tens", "hundred", "thousand"],
  teen: ["", "hundred", "thousand"],
  tens: ["", "hundred", "thousand"],
  hundred: ["unit", "teen"],
  thousand: ["unit", "teen", "tens", "hundred"],
};
const kind = (word: string): Kind | undefined =>
  word in UNITS
    ? "unit"
    : word in TEENS
      ? "teen"
      : word in TENS
        ? "tens"
        : word === "hundred" || word === "thousand"
          ? word
          : undefined;

/**
 * Reads a number phrase from word `start`: "twenty four", "one hundred and
 * twenty", "six point one", "4 point 5". `joined(k)` says whether words k and
 * k + 1 are separated only by spaces or a hyphen. Returns the digits, the
 * word after the phrase, and whether the phrase is unambiguous on its own (a
 * compound, a decimal, or ten and over).
 */
function readNumber(
  words: readonly string[],
  joined: (k: number) => boolean,
  start: number,
) {
  let total = 0,
    current = 0,
    count = 0,
    last: Kind | "" = "",
    k = start;
  const digits = /^\d+$/.test(words[start]);
  if (digits) {
    current = Number(words[start]);
    count = 1;
    k = start + 1;
  } else
    while (k < words.length && (k === start || joined(k - 1))) {
      // "and" only links a hundred or thousand to what follows it.
      const linked =
        words[k] === "and" &&
        (last === "hundred" || last === "thousand") &&
        joined(k) &&
        ["unit", "teen", "tens"].includes(kind(words[k + 1]) ?? "");
      const word = linked ? words[k + 1] : words[k];
      const next = kind(word);
      if (!next || !FOLLOWS[next].includes(last)) break;
      if (word === "zero" && last) break;
      if (next === "hundred") current *= 100;
      else if (next === "thousand") {
        total += current * 1000;
        current = 0;
      } else current += UNITS[word] ?? TEENS[word] ?? TENS[word];
      last = next;
      count++;
      k += linked ? 2 : 1;
    }
  if (!count) return null;
  const value = total + current;
  let text = String(value);
  // "point" and its digits: "six point one five", "4 point 5".
  let fraction = "";
  if (k < words.length && words[k] === "point" && joined(k - 1) && joined(k)) {
    let f = k + 1;
    if (/^\d+$/.test(words[f] ?? "")) fraction = words[f++];
    else
      while (
        f < words.length &&
        words[f] in UNITS &&
        (f === k + 1 || joined(f - 1))
      )
        fraction += String(UNITS[words[f++]]);
    if (fraction) {
      text += `.${fraction}`;
      k = f;
    }
  }
  return {
    text,
    end: k,
    alone: !!fraction || count > 1 || (!digits && value >= 10),
    changed: !digits || !!fraction,
  };
}

/**
 * Spoken numbers to digits: "six point one" → "6.1", "twenty four frames" →
 * "24 frames", "five seconds" → "5 seconds". A lone number under ten stays a
 * word unless a unit follows, so "one shot" and "two characters" read as said.
 */
export function normaliseNumbers(text: string): string {
  const parts = text.match(/\p{L}+|\d+|[^\p{L}\d]+/gu) ?? [];
  const at: number[] = [];
  parts.forEach((part, i) => /^[\p{L}\d]/u.test(part) && at.push(i));
  const words = at.map((i) => parts[i].toLowerCase());
  const joined = (k: number) =>
    k + 1 < at.length &&
    at[k + 1] === at[k] + 2 &&
    /^(?:[ \t]+|[ \t]*-[ \t]*)$/.test(parts[at[k] + 1]);
  const output: string[] = [];
  let next = 0;
  for (let k = 0; k < words.length;) {
    const found = readNumber(words, joined, k);
    const unit =
      !!found &&
      found.end < words.length &&
      joined(found.end - 1) &&
      UNIT_WORDS.has(words[found.end]);
    if (!found || !found.changed || !(found.alone || unit)) {
      k++;
      continue;
    }
    output.push(...parts.slice(next, at[k]), found.text);
    next = at[found.end - 1] + 1;
    k = found.end;
  }
  return output.concat(parts.slice(next)).join("");
}

/** Everything applied to a transcript after the model: words, then numbers. */
export function cleanTranscript(
  text: string,
  entries: readonly VoiceEntry[] = STUDIO_DICTIONARY,
): string {
  return normaliseNumbers(applyDictionary(text.trim(), entries))
    .replace(/\s+/g, " ")
    .trim();
}

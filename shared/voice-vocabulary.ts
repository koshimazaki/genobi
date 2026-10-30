/**
 * The words a spoken generation request can name a model with, built from
 * the registry (`shared/registry.ts`) rather than a list kept by hand, so a
 * renamed or added entry is heard without a second edit here. Pure and
 * portable: no Node or DOM APIs.
 *
 * Each runnable image or video entry gives its family ("flux", "ltx"), the
 * version in its label ("flux 3", "ltx 2.5") and the words that tell it apart
 * from its family ("klein", "fast", "pro", "acoustic space"), taken from its
 * label and its id with the family, version and task words removed.
 */
import { registry, type Entry, type Family, type ReadyEntry } from "./registry";

export interface Token {
  /** Lower case; number words as digits; "2 point 5" joined as "2.5". */
  word: string;
  /** Where the token sits in the text it was read from. */
  start: number;
  end: number;
}

/** What a model phrase names: one entry, or a whole family. */
export type ModelTarget =
  { kind: "entry"; id: string } | { kind: "family"; family: Family };

export interface Alias {
  words: readonly string[];
  target: ModelTarget;
  /** No family word in it ("klein"): heard only after "with", "using"… */
  bare: boolean;
  /** A likely mishearing ("client"): never read at the end of a subject. */
  heard: boolean;
}

/*
 * Every word table here is a Map or a Set, never a plain object: a spoken
 * "constructor" or "__proto__" must not find Object.prototype's members.
 */
const NUMBER_WORDS: ReadonlyMap<string, string> = new Map(
  [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ].map((word, n) => [word, String(n)]),
);
const numeric = (word: string) => /^\d+(\.\d+)?$/.test(word);

/**
 * Words with their positions. Hyphens and dots between letters split words
 * ("LTX-2.5" is "ltx", "2.5"); spoken numbers become digits, so "flux three"
 * and "flux 3", "two point five" and "2.5", read alike.
 */
export function tokenize(text: string): Token[] {
  const raw = [
    ...text.toLowerCase().matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu),
  ].map((m) => ({
    word: (NUMBER_WORDS.get(m[0]) ?? m[0]).replace("’", "'"),
    start: m.index,
    end: m.index + m[0].length,
  }));
  const tokens: Token[] = [];
  for (let i = 0; i < raw.length; i++) {
    const [a, mid, b] = [raw[i], raw[i + 1], raw[i + 2]];
    // "2.5" written, or "2 point 5" said.
    const dot = mid && text.slice(a.end, mid.start) === ".";
    if (numeric(a.word) && mid && numeric(mid.word) && dot) {
      tokens.push({
        word: `${a.word}.${mid.word}`,
        start: a.start,
        end: mid.end,
      });
      i += 1;
    } else if (
      numeric(a.word) &&
      mid?.word === "point" &&
      b &&
      numeric(b.word)
    ) {
      tokens.push({ word: `${a.word}.${b.word}`, start: a.start, end: b.end });
      i += 2;
    } else tokens.push(a);
  }
  return tokens;
}
const words = (text: string) => tokenize(text).map((t) => t.word);

/** What a request asks for: these words name the medium, not a model. */
export const MEDIUM_WORDS: ReadonlyMap<string, "image" | "video"> = new Map([
  ...[
    "image",
    "picture",
    "photo",
    "photograph",
    "still",
    "pic",
    "illustration",
  ].map((word) => [word, "image"] as const),
  ...["video", "clip", "film", "movie", "animation"].map(
    (word) => [word, "video"] as const,
  ),
]);
/** Words in a label or id that say what an entry does, not which it is. */
const TASK_WORDS = new Set(["text", "to", "edit", "upscale", "api", "t2i"]);

/**
 * Likely mishearings of a registry word, as token sequences. Local ASR often
 * writes "client" for Klein; "L T X" arrives letter by letter. A variant
 * applies only while the registry still derives its word, which
 * `tests/voice-intent.test.ts` checks, so this table cannot drift on its own.
 */
export const HEARD_VARIANTS: ReadonlyMap<string, readonly string[][]> = new Map(
  [
    ["klein", [["client"], ["kline"], ["klien"]]],
    ["ltx", [["l", "t", "x"]]],
  ],
);

/** The entries a spoken request can select: runnable stills and video. */
export const speakableEntries = (entries: readonly Entry[] = registry) =>
  entries.filter(
    (e): e is ReadyEntry =>
      e.status === "ready" &&
      !e.runOf &&
      (e.generator === "image" || e.generator === "video"),
  );

/** The words an entry adds to its family: "klein", "acoustic space". */
function distinct(entry: ReadyEntry, source: string) {
  return words(source).filter(
    (w) =>
      w !== entry.family &&
      !numeric(w) &&
      !TASK_WORDS.has(w) &&
      !MEDIUM_WORDS.has(w),
  );
}

/** Every alias the registry gives, longest first, mishearings included. */
export function voiceVocabulary(entries: readonly Entry[] = registry): Alias[] {
  const out: Alias[] = [];
  const seen = new Set<string>();
  const speakable = speakableEntries(entries);
  const families = new Set<string>(speakable.map((e) => e.family));
  const add = (
    list: string[],
    target: ModelTarget,
    heard = false,
    bare = !families.has(list[0]),
  ) => {
    const key = list.join(" ");
    if (!list.length || seen.has(key)) return;
    seen.add(key);
    out.push({ words: list, target, bare, heard });
  };
  for (const entry of speakable) {
    const versions = words(entry.label).filter(numeric);
    const target: ModelTarget = { kind: "entry", id: entry.id };
    // The whole label only when it names this entry alone: "FLUX 3" is a family.
    if (distinct(entry, entry.label).length) add(words(entry.label), target);
    for (const own of [
      distinct(entry, entry.label),
      distinct(entry, entry.id),
    ]) {
      if (!own.length) continue;
      add([entry.family, ...own], target);
      for (const v of versions) add([entry.family, v, ...own], target);
      add(own, target);
    }
  }
  for (const family of new Set(speakable.map((e) => e.family))) {
    add([family], { kind: "family", family });
    for (const v of new Set(
      speakable
        .filter((e) => e.family === family)
        .flatMap((e) => words(e.label).filter(numeric)),
    ))
      add([family, v], { kind: "family", family });
  }
  // Mishearings: each alias again with one heard variant in place of a word.
  for (const alias of [...out])
    alias.words.forEach((word, i) => {
      for (const variant of HEARD_VARIANTS.get(word) ?? []) {
        const list = [
          ...alias.words.slice(0, i),
          ...variant,
          ...alias.words.slice(i + 1),
        ];
        add(list, alias.target, true, alias.bare);
      }
    });
  return out.sort((a, b) => b.words.length - a.words.length);
}

/**
 * The longest alias at `at`, or none. `bare` allows an alias with no family
 * word; `heard` allows a mishearing.
 */
export function matchModel(
  tokens: readonly Token[],
  at: number,
  vocabulary: readonly Alias[],
  { bare, heard }: { bare: boolean; heard: boolean },
): { alias: Alias; next: number } | undefined {
  for (const alias of vocabulary) {
    if ((alias.bare && !bare) || (alias.heard && !heard)) continue;
    if (alias.words.every((w, i) => tokens[at + i]?.word === w))
      return { alias, next: at + alias.words.length };
  }
  return undefined;
}

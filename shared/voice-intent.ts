/**
 * A spoken generation request, read without a model (issue #23, "Voice goes
 * where it is meant"): "I want to generate an image with FLUX of a penguin"
 * asks for a still, from the FLUX family, of "a penguin". Deterministic and
 * pure, so the same words always route the same way and nothing is sent
 * anywhere to decide it. Portable: no Node or DOM APIs.
 *
 * A request names a medium ("image", "video"…) and/or a model, and a subject
 * after "of", "showing", a colon or a comma. Anything else ("open the
 * director", "make the video louder") is not a request and returns null.
 */
import {
  entryFor,
  menuId,
  registry,
  type Entry,
  type ReadyEntry,
} from "./registry";
import type { Generator, VideoModel } from "./types";
import {
  matchModel,
  MEDIUM_WORDS,
  speakableEntries,
  tokenize,
  voiceVocabulary,
  type Alias,
  type ModelTarget,
  type Token,
} from "./voice-vocabulary";

export interface VoiceIntent {
  medium?: "image" | "video";
  model?: ModelTarget;
  /** What to make, as it was said. */
  subject: string;
}

const seq = (text: string) => text.split(" ");
/** Openings that carry no meaning, skipped in any order. */
const FILLERS = [
  "hey genobi",
  "genobi",
  "ok",
  "okay",
  "so",
  "please",
  "now",
  "just",
  "i want to",
  "i wanna",
  "i'd like to",
  "i would like to",
  "can you",
  "could you",
  "would you",
  "let's",
  "lets",
  "go ahead and",
].map(seq);
const VERBS = [
  "generate",
  "make",
  "create",
  "render",
  "produce",
  "draw",
  "paint",
  "shoot",
  "do",
  "give me",
  "i want",
  "i need",
  "i'd like",
  "i would like",
].map(seq);
const ARTICLES = new Set([
  "a",
  "an",
  "the",
  "me",
  "some",
  "1",
  "another",
  "new",
]);
/** Before a model: "with FLUX", "using LTX", "in Klein". */
const BEFORE_MODEL = new Set(["with", "using", "in", "on", "via", "through"]);
/** At the end of the subject: "…of a penguin with FLUX". */
const AFTER_SUBJECT = new Set(["with", "using", "on"]);
const SUBJECT_WORDS = [
  "of",
  "showing",
  "about",
  "featuring",
  "depicting",
  "that shows",
].map(seq);
const POLITE_TAIL = new Set(["please", "thanks", "thank"]);

/** The phrase from `list` at `at`, as the index after it. */
function phrase(tokens: Token[], at: number, list: string[][]) {
  for (const words of list)
    if (words.every((w, i) => tokens[at + i]?.word === w))
      return at + words.length;
  return undefined;
}

/** A colon, comma or dash between two tokens marks the subject's start. */
const punctuated = (text: string, tokens: Token[], at: number) =>
  at > 0 &&
  at < tokens.length &&
  /[:,;—–-]/.test(text.slice(tokens[at - 1].end, tokens[at].start));

export function parseVoiceIntent(
  text: string,
  vocabulary: readonly Alias[] = defaultVocabulary(),
): VoiceIntent | null {
  const tokens = tokenize(text.slice(0, 4000));
  let at = 0;
  for (let next; (next = phrase(tokens, at, FILLERS)) !== undefined;) at = next;
  const verbEnd = phrase(tokens, at, VERBS);
  const verb = verbEnd !== undefined;
  if (verb) at = verbEnd;
  const afterVerb = at;
  while (ARTICLES.has(tokens[at]?.word)) at++;
  let model: ModelTarget | undefined;
  // "a FLUX image", "an LTX video": a model word before the medium.
  const before = matchModel(tokens, at, vocabulary, {
    bare: false,
    heard: true,
  });
  if (before && MEDIUM_WORDS.has(tokens[before.next]?.word)) {
    model = before.alias.target;
    at = before.next;
  }
  const medium = MEDIUM_WORDS.get(tokens[at]?.word);
  if (medium) at++;
  // "…with FLUX", "…using Klein".
  if (BEFORE_MODEL.has(tokens[at]?.word)) {
    const named = matchModel(tokens, at + 1, vocabulary, {
      bare: true,
      heard: true,
    });
    if (named && !model) {
      model = named.alias.target;
      at = named.next;
    }
  }
  // Where the subject starts: after "of" and the like, or punctuation. A
  // model clause straight after the verb ("generate with FLUX a penguin")
  // needs neither.
  const marked = phrase(tokens, at, SUBJECT_WORDS);
  let start: number | undefined;
  if (marked !== undefined) start = marked;
  else if (punctuated(text, tokens, at)) start = at;
  else if (model && !medium && verb) start = at;
  else if (!medium && !model && verb) start = afterVerb;
  if (start === undefined || (!verb && !medium)) return null;
  let end = tokens.length;
  while (end > start && POLITE_TAIL.has(tokens[end - 1].word)) end--;
  // "…of a penguin with FLUX": a model named last, never a mishearing.
  for (let k = end - 2; k > start && !model; k--) {
    if (!AFTER_SUBJECT.has(tokens[k].word)) continue;
    const named = matchModel(tokens, k + 1, vocabulary, {
      bare: true,
      heard: false,
    });
    if (named?.next === end) {
      model = named.alias.target;
      end = k;
    }
  }
  if (!medium && !model) return null;
  if (end <= start) return null;
  const subject = text.slice(tokens[start].start, tokens[end - 1].end).trim();
  return subject
    ? { ...(medium ? { medium } : {}), ...(model ? { model } : {}), subject }
    : null;
}

let vocabularyCache: Alias[] | undefined;
const defaultVocabulary = () => (vocabularyCache ??= voiceVocabulary(registry));

/**
 * The entry a request selects. A named entry is that entry; a family or a
 * medium alone is the first runnable entry that fits, in registry order
 * (Klein first among stills, LTX-2.5 Fast first among video). What the
 * composer already holds stays when it fits: its own run of the named model
 * (Klein on the API), or, for a family or a medium alone, the entry itself.
 * A medium the named model cannot make ("a video with Klein") selects
 * nothing.
 */
export function resolveVoiceIntent(
  intent: VoiceIntent,
  current?: { generator: Generator; model: VideoModel },
  entries: readonly Entry[] = registry,
): ReadyEntry | null {
  const { model, medium } = intent;
  const pool = speakableEntries(entries).filter(
    (e) =>
      (!medium || e.generator === medium) &&
      (!model ||
        (model.kind === "entry"
          ? e.id === model.id
          : e.family === model.family)),
  );
  if (!pool.length) return null;
  const held = current && entryFor(current.generator, current.model);
  if (held && pool.some((e) => e.id === menuId(held))) return held;
  return pool[0];
}

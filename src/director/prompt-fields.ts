/**
 * The project prompt read as fields for display only. The text stays one
 * string (`brief/prompt.json`); this splits it into lines and names the ones
 * that start with a short label ("Look: …", "Palette: …"), so the editor can
 * colour the label and show palette swatches and reference tiles. Nothing
 * here changes the words the agent receives.
 */
export type PromptFieldKey =
  | "header"
  | "subject"
  | "title"
  | "look"
  | "lighting"
  | "palette"
  | "negative"
  | "shots"
  | "references"
  | "audio"
  | "other";

export interface PromptLine {
  text: string;
  /** Set when the line is a labelled field or the template's header line. */
  field?: PromptFieldKey;
  /** The label with its colon, as typed ("Look:"); empty for the header. */
  label: string;
  /** The rest of the line after the label, as typed. */
  body: string;
  /** Hex colours in a palette body, in order. */
  swatches: string[];
  /** The body holds only reference tokens, so they show as large tiles. */
  tiles: boolean;
}

const TOKEN_SOURCE = String.raw`\[(?:Image|Video|Inspiration|Font) [1-9][0-9]?\]`;
const TOKEN = new RegExp(TOKEN_SOURCE, "g");
const HAS_TOKEN = new RegExp(TOKEN_SOURCE);
const LABEL = /^([A-Z][A-Za-z]*(?: [A-Za-z]+){0,2}):(?=\s|$)/;
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;
const KEYS: Record<string, PromptFieldKey> = {
  brief: "subject",
  subject: "subject",
  product: "subject",
  character: "subject",
  space: "subject",
  title: "title",
  headline: "title",
  look: "look",
  style: "look",
  lighting: "lighting",
  light: "lighting",
  palette: "palette",
  colour: "palette",
  colours: "palette",
  color: "palette",
  "negative space": "negative",
  shots: "shots",
  shot: "shots",
  camera: "shots",
  references: "references",
  reference: "references",
  audio: "audio",
  music: "audio",
  sound: "audio",
};

/** True when a body is reference tokens and spaces, nothing else. */
const onlyTokens = (body: string) =>
  HAS_TOKEN.test(body) && !body.replace(TOKEN, "").trim();

export function promptLine(text: string, index: number): PromptLine {
  const plain = {
    text,
    label: "",
    body: text,
    swatches: [],
    tiles: false,
  };
  const match = LABEL.exec(text);
  if (match && match[1].length <= 24) {
    const field = KEYS[match[1].toLowerCase()] ?? "other";
    const body = text.slice(match[0].length);
    return {
      text,
      field,
      label: match[0],
      body,
      swatches: field === "palette" ? (body.match(HEX) ?? []) : [],
      tiles: onlyTokens(body),
    };
  }
  // The template's first line names it: "Anime teaser · Ink and ember · …".
  if (index === 0 && / · /.test(text) && !HAS_TOKEN.test(text))
    return { ...plain, field: "header" };
  return { ...plain, tiles: onlyTokens(text) };
}

export function promptLines(text: string): PromptLine[] {
  return text ? text.split("\n").map(promptLine) : [];
}

/**
 * What decides the rendered structure: line count, each line's field, its
 * swatches and whether it shows tiles. Typing inside a field body leaves it
 * alone, so native editing keeps its DOM; a new line or label redraws.
 */
export function promptLayout(text: string) {
  return promptLines(text)
    .map((l) => `${l.field ?? ""}:${l.label}:${l.swatches.join()}:${l.tiles}`)
    .join("\n");
}

/** A body split around palette hex values, so a swatch can sit before each. */
export function swatchPieces(body: string) {
  const pieces: { text: string; hex?: string }[] = [];
  let last = 0;
  for (const m of body.matchAll(HEX)) {
    if (m.index > last) pieces.push({ text: body.slice(last, m.index) });
    pieces.push({ text: m[0], hex: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) pieces.push({ text: body.slice(last) });
  return pieces;
}

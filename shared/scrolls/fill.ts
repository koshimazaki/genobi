// "Describe the video" in Scrolls: the person's description and example
// pairs (a reference sheet or storyboard with the prompt it was made from, as
// the generator records them) written as one agent session's prompt, and the
// rule for the panels the agent sends back with `genobi_scrolls_panels`.
// The agent fills text only; the person edits the panels and presses
// Generate board, which quotes as usual. Nothing here generates or spends.
import { AGENT_PROMPT_MAX } from "../agent-session";
import {
  FENCE,
  REGENERATE_INSTRUCTION_MAX,
  cleanInstruction,
} from "../director/regenerate";
import { QUOTED_PROMPT } from "./generator";
import { fail, object, text, type ScrollDocument } from "./types";

/** The one-use code the studio puts in the prompt and the agent sends back. */
export const FILL_CODE = /^[a-f0-9]{32}$/;
export const CELL_ID = /^cell-[0-9]{1,3}$/;

export interface PanelFill {
  cellId: string;
  title?: string;
  prompt?: string;
  camera?: string;
  action?: string;
}

/**
 * The panels an agent sends: one entry per named cell at most, only cells
 * the request named, each field within the cell's own limits and free of
 * control characters (line breaks allowed in a prompt). Anything else is
 * refused whole, so a partial fill never lands.
 */
export function parsePanels(
  value: unknown,
  cellIds: readonly string[],
): PanelFill[] {
  if (!Array.isArray(value) || !value.length || value.length > 16)
    fail("Send 1 to 16 panels.");
  const seen = new Set<string>();
  return (value as unknown[]).map((item) => {
    const p = object(item, ["cellId", "title", "prompt", "camera", "action"]);
    if (
      typeof p.cellId !== "string" ||
      !CELL_ID.test(p.cellId) ||
      !cellIds.includes(p.cellId)
    )
      fail("A panel names a cell this scroll does not have.");
    if (seen.has(p.cellId as string)) fail("Each panel appears once.");
    seen.add(p.cellId as string);
    const panel: PanelFill = { cellId: p.cellId as string };
    if (p.title !== undefined) panel.title = oneLine(p.title, 80);
    if (p.camera !== undefined) panel.camera = oneLine(p.camera, 300);
    if (p.action !== undefined) panel.action = oneLine(p.action, 300);
    if (p.prompt !== undefined) panel.prompt = text(p.prompt, 1500);
    if (Object.keys(panel).length === 1)
      fail("Give each panel a title, camera, action or prompt.");
    return panel;
  });
}

function oneLine(value: unknown, max: number) {
  const line = text(value, max);
  if (/[\n\r\t]/.test(line)) fail("Titles, camera and action are one line.");
  return line;
}

/** A reference with the prompt it was made from, or a catalogue plan. */
export interface FillExample {
  name: string;
  /** The recorded prompt; absent when none was recorded. */
  prompt?: string;
  /** A catalogue plan's shots: title, camera, action. */
  shots?: readonly (readonly [string, string, string])[];
}

export interface FillInput {
  description: string;
  document: ScrollDocument;
  examples: readonly FillExample[];
  code: string;
}

/** One line of someone's text: no control characters, bounded. */
const line = (value: string, max: number) => {
  const flat = value.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
/** A line of dashes alone would close a fence early; bracket it. */
const fenced = (value: string) =>
  value.replace(/^ *-{3,} *$/gm, (dashes) => `(${dashes.trim()})`);

/** The most of a description one Send carries, as Regenerate's instruction. */
export const DESCRIPTION_MAX = REGENERATE_INSTRUCTION_MAX;

/** True when `cleanInstruction` keeps only the first `DESCRIPTION_MAX` characters. */
export const descriptionCut = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim().length > DESCRIPTION_MAX;

/** The prompt one Send writes; never longer than `AGENT_PROMPT_MAX`. */
export function fillMessage(input: FillInput): string {
  const { document: d, code } = input;
  if (!FILL_CODE.test(code)) throw new Error("Invalid fill code.");
  const description = cleanInstruction(input.description);
  if (!description) throw new Error("Describe the video first.");
  const kind = d.kind === "storyboard" ? "storyboard" : "character sheet";
  const ids = d.cells.map((c) => c.id);
  const head = [
    `Fill the panels of the person's open ${kind} "${line(d.name, 120)}" in Scrolls (${ids.length} panels: ${ids.join(", ")}). They pressed Send under "Describe the video". Their description, ${descriptionCut(input.description) ? `cut to its first ${DESCRIPTION_MAX.toLocaleString("en-GB")} characters` : "verbatim"}, between the ${FENCE} lines:`,
    FENCE,
    description,
    FENCE,
    "",
    "Write each panel in order so the panels tell the description from start to end: its title (what happens, one line), and where it helps its camera, action and a short prompt.",
  ].join("\n");
  const tail = [
    "",
    "",
    `Load genobi-scrolls with genobi_skill, then call genobi_scrolls_panels once with code ${code} and one entry per panel ({cellId, title, camera, action, prompt}; title up to 80 characters, camera and action up to 300, prompt up to 1500). It writes text into the person's open scroll and nothing else.`,
    "Do not quote or generate: the person edits the panels and presses Generate board themselves, which quotes as usual. Finish with the panels you wrote.",
  ].join("\n");
  let body = "";
  const room = () => AGENT_PROMPT_MAX - head.length - tail.length - body.length;
  body += fit(panelsSection(d), room());
  for (const section of exampleSections(input.examples))
    body += fit(section, room());
  return `${head}${body}${tail}`;
}

interface Section {
  title: string;
  lines: string[];
  more?: (left: number) => string;
}

/** The title, the person's lines fenced, and as many lines as fit. */
function fit(section: Section, room: number): string {
  const open = `\n\n${section.title}\n${FENCE}`;
  const close = `\n${FENCE}`;
  if (open.length + close.length > room) return "";
  let out = open;
  let kept = 0;
  for (const next of section.lines) {
    const left = section.lines.length - kept - 1;
    const pointer = left && section.more ? `\n${section.more(left)}` : "";
    if (out.length + 1 + next.length + pointer.length + close.length > room)
      break;
    out += `\n${next}`;
    kept++;
  }
  if (!kept) return "";
  const left = section.lines.length - kept;
  return `${out}${left && section.more ? `\n${section.more(left)}` : ""}${close}`;
}

function panelsSection(d: ScrollDocument): Section {
  return {
    title: `The panels now, the person's words verbatim (cell: title | camera | action | prompt). Keep what they wrote unless the description changes it:`,
    lines: d.cells.map(
      (c) =>
        `${c.id}: ${line(c.title, 80)} | ${line(c.camera, 120) || "-"} | ${line(c.action, 120) || "-"} | ${line(c.prompt, 200) || "-"}`,
    ),
    more: (left) => `… ${left} more panels, as titled in Scrolls.`,
  };
}

/** Each example pair: its recorded prompt, or a catalogue plan's shots. */
function exampleSections(examples: readonly FillExample[]): Section[] {
  return examples.slice(0, 3).map((e, i) => ({
    title: `Example pair ${i + 1}, "${line(e.name, 80)}": a ${e.shots ? "storyboard plan" : "reference"} and the prompt it was made from, verbatim. Follow how its panels are written, not its content:`,
    lines: [
      fenced(
        e.prompt
          ? line(e.prompt, QUOTED_PROMPT)
          : "No prompt recorded for this reference.",
      ),
      ...(e.shots ?? []).map(
        ([title, camera, action], n) =>
          `Panel ${n + 1}: ${line(title, 80)} | ${line(camera, 80)} | ${line(action, 80)}`,
      ),
    ],
  }));
}

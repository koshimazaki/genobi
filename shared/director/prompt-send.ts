// What the Editor's two Send to Genobi buttons hand the agent as Regenerate's
// instruction (`regenerate.ts` wraps it with the person's edits and the
// timeline): the clip inspector's, one clip's prompt and typed directions
// with the global prompt as shared context; the Global prompt's, the global
// prompt and the clip prompts the agent has not seen in this turn's edits.
// Both stay within `REGENERATE_INSTRUCTION_MAX`, so `cleanInstruction`
// never cuts them without a pointer. Only what the project already shows
// the agent through genobi_project goes in: ids, names, times and the
// person's words. Nothing here quotes or submits anything.
import type { DirectorFeedback } from "./feedback";
import { cutAt } from "../agent-context-direction";
import { cleanPrompt, directionWords } from "./directions";
import { clean } from "./layer-commands";
import { REGENERATE_INSTRUCTION_MAX } from "./regenerate";
import type { Layer, Project } from "./types";

/** The longest instruction either Send writes. */
export const PROMPT_SEND_MAX = REGENERATE_INSTRUCTION_MAX;
/** The most of the global prompt the Global send gives when clips follow. */
export const GLOBAL_SHARE_MAX = 700;
/** The most of one clip's words in the Global send's list. */
export const CLIP_LINE_WORDS_MAX = 240;

const CUT = " (cut here; read the rest with genobi_project)";
/** The first `max` UTF-16 units of `text`, never half a surrogate pair. */
const head = (text: string, max: number) => text.slice(0, cutAt(text, max));
const name = (layer: Layer) => {
  const full = clean(layer.name);
  return (full.length > 60 ? `${head(full, 59)}…` : full) || layer.id;
};
/** The person's words: line breaks kept, other control characters gone. */
const words = (text: string | undefined) =>
  cleanPrompt(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();

/** `text` within `room` characters, ending on `pointer` when it was cut. */
export function cutTo(text: string, room: number, pointer = CUT) {
  if (text.length <= room) return text;
  if (room <= pointer.length) return "";
  return `${head(text, room - pointer.length).trimEnd()}${pointer}`;
}

/** Where the clip sits: "1.00s–3.50s (frames 24–84 at 24 fps)". */
export function clipTime(layer: Layer, project: Project) {
  const { fps } = project.composition;
  const end = layer.startFrame + layer.durationFrames;
  const s = (frame: number) => `${(frame / fps).toFixed(2)}s`;
  return `${s(layer.startFrame)}–${s(end)} (frames ${layer.startFrame}–${end} at ${fps} fps)`;
}

/** What the clip shows: "video from asset a1", "graphics (animejs)". */
export function clipSource(layer: Layer, project: Project) {
  if ("assetId" in layer) return `${layer.kind} from asset ${layer.assetId}`;
  const engine = project.modules[layer.moduleId]?.engine;
  return engine ? `${layer.kind} (${engine})` : layer.kind;
}

const sameDirection = (a: Layer, b: Layer | undefined) =>
  !!b &&
  words(a.prompt) === words(b.prompt) &&
  directionWords(a.directions) === directionWords(b.directions);

const hasDirection = (layer: Layer) =>
  !!words(layer.prompt) || !!directionWords(layer.directions);

/**
 * The clip inspector's Send: this clip's prompt and directions, then the
 * global prompt as shared context in whatever room is left. "" when the clip
 * has no prompt (the button then asks for one) or is not in the project.
 */
export function clipPromptInstruction(project: Project, layerId: string) {
  const layer = project.layers.find((l) => l.id === layerId);
  const prompt = words(layer?.prompt);
  if (!layer || !prompt) return "";
  const typed = directionWords(layer.directions);
  const head = [
    `Work on one clip of the linked project, as the person directed it in the clip inspector: clip ${layer.id} "${name(layer)}", ${clipSource(layer, project)}, ${clipTime(layer, project)}.`,
    typed ? `Its typed directions: ${typed}.` : "It has no typed directions.",
    "Change this clip only, unless its prompt asks for more. Its prompt:",
  ].join("\n");
  const global = words(project.globalPrompt);
  const shared =
    "\n\nThe project's global prompt, shared context for every clip:\n";
  const pointer =
    "\n\nThe project also has a global prompt; read it with genobi_project.";
  // The clip's words come first; the global prompt takes what is left.
  const reserve = global ? Math.min(pointer.length, shared.length + 80) : 0;
  const body = cutTo(prompt, PROMPT_SEND_MAX - head.length - 1 - reserve);
  let text = `${head}\n${body}`;
  if (!global) return text;
  const room = PROMPT_SEND_MAX - text.length - shared.length;
  const context = cutTo(global, room);
  // A cut so short it would say little gives way to the pointer.
  const useful = context === global || context.length >= CUT.length + 40;
  text += context && useful ? `${shared}${context}` : fits(text, pointer);
  return text;
}
const fits = (text: string, add: string) =>
  text.length + add.length <= PROMPT_SEND_MAX ? add : "";

/** The layer ids a feedback's prompt and direction commands name. */
export function changedClips(feedback: DirectorFeedback) {
  const ids = new Set<string>();
  for (const { command } of feedback.commands)
    if (
      (command.op === "set-clip-prompt" ||
        command.op === "set-clip-directions") &&
      "layerId" in command
    )
      ids.add(command.layerId);
  return ids;
}

export interface PromptsInstruction {
  text: string;
  /** The clips the instruction names, by words or by their edit. */
  clipIds: string[];
}

/**
 * The Global prompt's Send. With no agent revision on the project there are
 * no feedback commands, so every clip's words are listed. With one, a clip
 * prompt or direction changed since it is already in the feedback commands
 * that follow the instruction, word for word: it is named here, not
 * repeated; one no command could carry (a locked clip) is listed in full. Unchanged clips are listed only when nothing else would be sent
 * (no global prompt, no changed clip), since the agent already has them.
 * Empty text when there is no global prompt and no clip direction at all.
 */
export function promptsInstruction(
  project: Project,
  feedback: DirectorFeedback,
): PromptsInstruction {
  const global = words(project.globalPrompt);
  const directed = [...project.layers]
    .filter(hasDirection)
    .sort((a, b) => a.startFrame - b.startFrame);
  if (!global && !directed.length) return { text: "", clipIds: [] };
  const ordered = [...project.layers].sort(
    (a, b) => a.startFrame - b.startFrame,
  );
  const covered = changedClips(feedback);
  const changed =
    feedback.baseRevision === null
      ? []
      : ordered.filter((l) => covered.has(l.id));
  // Changed, but no command could carry it (refused against the agent's
  // revision, as on a locked clip): its words go in the list.
  const was = new Map(
    project.feedbackBase?.project.layers.map((l) => [l.id, l]) ?? [],
  );
  const uncarried = directed.filter(
    (l) => !covered.has(l.id) && !sameDirection(l, was.get(l.id)),
  );
  const listed =
    feedback.baseRevision === null || (!global && !changed.length)
      ? directed
      : uncarried;
  if (!listed.length && !changed.length) {
    // The global prompt alone, as before.
    const head =
      "Follow the project's global prompt, now saved in the project:\n";
    return {
      text: `${head}${cutTo(global, PROMPT_SEND_MAX - head.length)}`,
      clipIds: [],
    };
  }
  let text = global
    ? `Follow the project's direction, now saved in the project. The global prompt, for the whole piece:\n${cutTo(global, GLOBAL_SHARE_MAX)}`
    : "Follow the clip prompts saved in the project; it has no global prompt.";
  const clipIds: string[] = [];
  const add = (title: string, lines: [string, string][], more: string) => {
    if (!lines.length) return;
    const pointer = (left: number) => `\n… ${left} more; ${more}`;
    let block = `\n\n${title}`;
    if (
      text.length + block.length + pointer(lines.length).length >
      PROMPT_SEND_MAX
    )
      return;
    let kept = 0;
    for (const [id, next] of lines) {
      const left = lines.length - kept - 1;
      const tail = left ? pointer(left).length : 0;
      if (text.length + block.length + 1 + next.length + tail > PROMPT_SEND_MAX)
        break;
      block += `\n${next}`;
      clipIds.push(id);
      kept++;
    }
    if (kept < lines.length) block += pointer(lines.length - kept);
    text += block;
  };
  add(
    "Each clip's own prompt and typed directions, by start time:",
    listed.map((l) => [l.id, clipLine(l, project)]),
    "read genobi_project for every clip's prompt.",
  );
  add(
    `Clips whose prompt or directions the person changed since your revision ${feedback.baseRevision}; their words are in the set-clip-prompt and set-clip-directions commands below:`,
    changed.map((l) => [
      l.id,
      `- ${l.id} "${name(l)}" ${clipTime(l, project)}`,
    ]),
    "read genobi_project_feedback.",
  );
  return { text, clipIds };
}

function clipLine(layer: Layer, project: Project) {
  const typed = directionWords(layer.directions);
  const prompt = words(layer.prompt).replace(/\s*\n\s*/g, " / ");
  return `- ${layer.id} "${name(layer)}" ${clipSource(layer, project)}, ${clipTime(layer, project)}${typed ? `; directions: ${typed}` : ""}${prompt ? `; prompt: ${cutTo(prompt, CLIP_LINE_WORDS_MAX, "… (cut; genobi_project has the rest)")}` : ""}`;
}

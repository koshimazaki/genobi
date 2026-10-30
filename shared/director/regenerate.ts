// Regenerate from the Editor: the person's instruction and their edits,
// written as the agent session's prompt. Nothing new is invented here: the
// edits are the feedback export (`feedback.ts`, schema
// `genobi.director-feedback.v1`) as Director commands with their labels, the
// open frame notes and what no command can express, then the timeline as
// the project holds it. The agent reads the same feedback in full with
// `genobi_project_feedback` on the linked project; this prompt only has to
// fit the session's prompt limit (`AGENT_PROMPT_MAX`), so a long list is cut
// with a pointer to that tool.
import { AGENT_PROMPT_MAX, type AgentSessionStatus } from "../agent-session";
import { FEEDBACK_SCHEMA, type DirectorFeedback } from "./feedback";
import { short } from "./feedback-labels";
import { clean } from "./layer-commands";
import { laneLabels, lanes } from "./tracks";
import type { Layer, Project } from "./types";

/** The Editor's field takes at most this much; the rest is the project's. */
export const REGENERATE_INSTRUCTION_MAX = 1500;

export interface RegenerateInput {
  /** What the person typed under "What should change?". */
  instruction: string;
  project: Project;
  /** The open project's feedback (`projectFeedback`). */
  feedback: DirectorFeedback;
  /**
   * The last session on this project, when this is its next turn. Sessions
   * run one turn each; the project memory holds the rest of their record.
   */
  previous?: { status: AgentSessionStatus; summary?: string };
  /**
   * A mix template's optional upscale step, as `mixUpscaleLine` writes it;
   * absent on every other project.
   */
  optionalStep?: string;
}

/** One line of the person's text: no control characters, bounded. */
const line = (text: string, max: number) => short(clean(text), max);

/** What fences the person's own words, so the agent sees where they end. */
export const FENCE = "---";

/**
 * The instruction keeps its line breaks; other control characters go, and a
 * line of dashes alone is bracketed so it cannot close the fence early.
 */
export function cleanInstruction(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REGENERATE_INSTRUCTION_MAX)
    .replace(/^ *-{3,} *$/gm, (dashes) => `(${dashes.trim()})`);
}

const CLOSING =
  "Work on the linked project through Director commands. Quote every paid step with genobi_quote and wait for the person's approval in the studio; never resubmit an uncertain run. Finish with what you changed and what the person has to do next.";

/** The prompt a Regenerate sends; never longer than `AGENT_PROMPT_MAX`. */
export function regenerateMessage(input: RegenerateInput): string {
  const { project, feedback, previous } = input;
  const instruction = cleanInstruction(input.instruction);
  if (!instruction) throw new Error("Say what should change.");
  const head = [
    `Regenerate the linked Director project "${line(project.name, 120)}" (id ${project.id}, revision ${project.revision}). The person reviewed it in the Editor and pressed Regenerate. Their instruction, verbatim, between the ${FENCE} lines:`,
    FENCE,
    instruction,
    FENCE,
    "",
    ...(previous
      ? [
          `This is the next turn on this project: the previous session ended ${previous.status}.${previous.summary ? ` Its summary: ${line(previous.summary, 300)}` : ""} The project memory holds the rest.`,
          "",
        ]
      : []),
    "Their edits are already saved in the linked project copy. Read them with genobi_project_feedback and genobi_project before acting, and keep them in your next pass.",
    ...(input.optionalStep ? ["", line(input.optionalStep, 600)] : []),
  ].join("\n");
  const tail = `\n\n${CLOSING}`;
  const sections = [
    feedbackSection(feedback),
    notesSection(feedback),
    unmappedSection(feedback),
    timelineSection(project),
  ];
  let body = "";
  for (const section of sections) {
    if (!section) continue;
    const room = AGENT_PROMPT_MAX - head.length - tail.length - body.length;
    body += fit(section, room);
  }
  return `${head}${body}${tail}`;
}

interface Section {
  title: string;
  lines: string[];
  /** Said in place of the lines that do not fit. */
  more: (left: number) => string;
  /** The lines are the person's words: fenced, pointer included. */
  fenced?: true;
}

/**
 * The section's title and as many lines as fit in `room` characters, with a
 * closing "… N more" when some were left out; empty when not even the title
 * and one line (or the pointer alone) fit.
 */
function fit(section: Section, room: number): string {
  const open = section.fenced ? `\n${FENCE}` : "";
  const close = section.fenced ? `\n${FENCE}` : "";
  const title = `\n\n${section.title}${open}`;
  if (title.length + close.length > room) return "";
  let text = title;
  let kept = 0;
  for (const next of section.lines) {
    const after = section.lines.length - kept - 1;
    const tailText = after ? `\n${section.more(after)}` : "";
    if (text.length + 1 + next.length + tailText.length + close.length > room)
      break;
    text += `\n${next}`;
    kept++;
  }
  if (kept === section.lines.length) return text + close;
  const pointer = `\n${section.more(section.lines.length - kept)}`;
  if (text.length + pointer.length + close.length > room) return "";
  return text + pointer + close;
}

const FULL = "read genobi_project_feedback for the full list";

function feedbackSection(feedback: DirectorFeedback): Section | undefined {
  if (feedback.baseRevision === null)
    return {
      title:
        "No agent revision is recorded on this project yet, so there are no feedback commands; the timeline below is the person's edit.",
      lines: [],
      more: () => "",
    };
  if (!feedback.commands.length) return undefined;
  return {
    title: `The person's changes since your revision ${feedback.baseRevision}, as ${FEEDBACK_SCHEMA} Director commands in order:`,
    lines: feedback.commands.map(
      ({ command, label }, i) =>
        `${i + 1}. ${line(label, 300)} ${JSON.stringify(command)}`,
    ),
    more: (left) => `… ${left} more; ${FULL}.`,
  };
}

function notesSection(feedback: DirectorFeedback): Section | undefined {
  if (!feedback.notes.length) return undefined;
  return {
    title: `Open frame notes, the person's words verbatim after each colon, between the ${FENCE} lines (resolve each once it is done):`,
    fenced: true,
    lines: feedback.notes.map(
      (note) =>
        `- ${note.id} at frame ${note.frame}${note.layerId ? ` on ${note.layerId}` : ""}${note.author === "agent" ? " (yours)" : ""}: ${line(note.text, 240)}`,
    ),
    more: (left) => `… ${left} more notes; ${FULL}.`,
  };
}

function unmappedSection(feedback: DirectorFeedback): Section | undefined {
  if (!feedback.unmapped.length) return undefined;
  return {
    title: "Changes no Director command can express:",
    lines: feedback.unmapped.map(
      (item) => `- ${line(item.label, 200)} (${line(item.reason, 160)})`,
    ),
    more: (left) => `… ${left} more; ${FULL}.`,
  };
}

/** Each clip by track, bottom track first: what the person's order is now. */
function timelineSection(project: Project): Section | undefined {
  if (!project.layers.length) return undefined;
  const all = lanes(project.layers);
  const labels = laneLabels(all);
  const lines = all.flatMap((lane) =>
    lane.layers.map(
      (layer) => `- ${labels.get(lane.id)} ${clip(layer, project)}`,
    ),
  );
  return {
    title: `The timeline now, bottom track first (frames at ${project.composition.fps} fps, ${project.composition.durationFrames} in all):`,
    lines,
    more: (left) => `… ${left} more clips; read genobi_project.`,
  };
}

function clip(layer: Layer, project: Project) {
  const end = layer.startFrame + layer.durationFrames;
  const source =
    "sourceStartFrame" in layer && layer.sourceStartFrame
      ? `, source from frame ${layer.sourceStartFrame}`
      : "";
  const asset =
    "assetId" in layer && project.assets[layer.assetId]
      ? `asset ${layer.assetId}`
      : "";
  const notes = [asset, layer.muted && "muted", layer.locked && "locked"]
    .filter(Boolean)
    .join(", ");
  return `${layer.id} "${line(layer.name, 60)}" ${layer.kind}${notes ? ` (${notes})` : ""}: frames ${layer.startFrame}–${end}${source}`;
}

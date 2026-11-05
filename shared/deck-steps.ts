/**
 * The deck's chain of steps (issue #96): what the shown agent session and
 * the studio's running jobs have done and are doing, oldest first, each
 * with its state and a short label. Every step comes from structured data
 * the studio already receives: the conversation's entries, the tool calls
 * the runner's own events reported (`AgentSession.tools`), the quoted paid
 * steps and what they came to, the session's status, and the job lines the
 * studio polls. The agent's free text is never read here, so nothing it
 * writes can make a step look done; the log shows that text as received.
 */
import { approvable, type AgentApproval } from "./agent-approval";
import type { AgentSession } from "./agent-session";
import type { AgentToolCall } from "./agent-session-events";

/**
 * - `done`: it happened (a request heard, a tool answered, a run started).
 * - `working`: under way now.
 * - `waiting`: waiting for the person (an approval, their next message).
 * - `failed`: it reported a failure or ran out.
 * - `unknown`: nobody can say: a run that may have started, a tool call
 *   with no result when its session ended, an interrupted session.
 */
export type DeckStepState =
  "done" | "working" | "waiting" | "failed" | "unknown";

export interface DeckStep {
  /** Stable within one chain, for the list's keys. */
  id: string;
  state: DeckStepState;
  /** A short human label: "Voice · 'swap the apple' · heard". */
  label: string;
}

/** A running job's line, as `src/busy.ts` publishes it. */
export interface DeckJob {
  id: string;
  line: string;
}

/** Steps kept in one chain; older ones are dropped past this. */
export const DECK_STEPS_MAX = 40;
/** How much of the person's words a step quotes. */
const QUOTE_CHARS = 36;

const quoted = (text: string) => {
  const flat = Array.from(text, (c) => (c < " " || c === "\x7f" ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return `'${flat.length > QUOTE_CHARS ? `${flat.slice(0, QUOTE_CHARS - 1)}…` : flat}'`;
};

/** Readable names for Genobi's own tools; anything else shows its name. */
const TOOL_LABELS: Record<string, string> = {
  genobi_status: "Studio status",
  genobi_context: "Project context",
  genobi_project: "Project read",
  genobi_projects: "Projects",
  genobi_link_project: "Project link",
  genobi_director_command: "Director",
  genobi_quote: "Quote",
  genobi_jobs: "Jobs",
  genobi_job: "Job",
  genobi_take: "Take",
  genobi_take_to_project: "Take to project",
  genobi_template_plan: "Template plan",
  genobi_models: "Models",
  genobi_workflows: "Workflows",
  genobi_effects: "Effects",
  genobi_effect_variant: "Effect variant",
  genobi_world_recipe: "World recipe",
  genobi_world: "World",
  genobi_scene: "Scene",
  genobi_audio_analysis: "Audio analysis",
  genobi_voice_transcribe: "Voice transcription",
  genobi_decision: "Decision",
  genobi_session_checkpoint: "Checkpoint",
  genobi_taste: "Taste",
  genobi_reference: "Reference",
  genobi_media_probe: "Media probe",
  genobi_media_frames: "Frames",
  genobi_media_trim: "Trim",
  genobi_media_concat: "Concat",
  genobi_upscale_parts_plan: "Upscale plan",
  genobi_docs: "Docs",
  genobi_skill: "Skill",
};

/** What a finished call is called: a Director edit is applied, a read is read. */
const toolDone = (name: string) =>
  name === "genobi_director_command"
    ? "applied"
    : name === "genobi_quote"
      ? "priced"
      : "done";

function toolLabel(call: AgentToolCall, ended: boolean) {
  const name = TOOL_LABELS[call.name] ?? call.name;
  const head = call.detail ? `${name} · ${call.detail}` : name;
  if (call.state === "working")
    return ended ? `${head} · no result` : `${head} · working`;
  return `${head} · ${call.state === "done" ? toolDone(call.name) : "failed"}`;
}

const money = (usd: number) =>
  Number.isFinite(usd) && usd > 0 ? ` · $${usd.toFixed(2)}` : "";

/** A quoted paid step: waiting for the person, then what it came to. */
function approvalStep(approval: AgentApproval, now: number): DeckStep {
  const head = `Quote · ${approval.plan.label}${money(approval.estimateUsd)}`;
  const step = (state: DeckStepState, word: string): DeckStep => ({
    id: `quote-${approval.quoteId}`,
    state,
    label: `${head} · ${word}`,
  });
  switch (approval.status) {
    case "pending":
      return approvable(approval, now)
        ? step("waiting", "waiting for you")
        : step("failed", "expired");
    case "submitting":
      return step("working", "approved · sending");
    case "started":
      return step("done", "approved · started");
    case "declined":
      return step("done", "declined");
    case "expired":
      return step("failed", "expired");
    case "refused":
      return step("failed", "refused · ask for a new quote");
    case "uncertain":
      return step("unknown", "may have started · check the gallery");
  }
}

/** The session's own state, as the last step, when it says something. */
function statusStep(session: AgentSession, steps: DeckStep[]): DeckStep[] {
  const runner = session.runner === "hermes" ? "Hermes" : "Claude Code";
  const id = `status-${session.status}`;
  const anyWorking = steps.some((s) => s.state === "working");
  const anyWaiting = steps.some((s) => s.state === "waiting");
  switch (session.status) {
    case "starting":
      return [{ id, state: "working", label: `Starting ${runner}` }];
    case "running":
      if (session.idle)
        return [
          { id, state: "waiting", label: "Waiting for your next message" },
        ];
      return anyWorking
        ? []
        : [{ id, state: "working", label: `${runner} · working` }];
    case "waiting":
      return anyWaiting
        ? []
        : [{ id, state: "waiting", label: "Waiting for your approval" }];
    case "done":
      return [{ id, state: "done", label: "Session · done" }];
    case "failed":
      return [
        { id, state: "failed", label: "Session · stopped with an error" },
      ];
    case "stopped":
      return [{ id, state: "done", label: "Session · stopped" }];
    case "interrupted":
      return [{ id, state: "unknown", label: "Session · interrupted" }];
  }
}

/**
 * The chain, oldest first: the conversation's requests and the tool calls in
 * the order they happened, then the quoted steps, then the running jobs, then
 * the session's own state. Empty when nothing has happened or is running.
 */
export function deckSteps({
  session,
  jobs,
  now = Date.now(),
}: {
  session?: AgentSession;
  jobs: readonly DeckJob[];
  now?: number;
}): DeckStep[] {
  const steps: DeckStep[] = [];
  if (session) {
    const ended = session.status !== "starting" && session.status !== "running";
    const exchange = session.exchange ?? [];
    const timed: { at: string; step: DeckStep }[] = [];
    // An older server sends no conversation: its first prompt still counts.
    if (!exchange.length)
      timed.push({
        at: session.startedAt,
        step: {
          id: "ask-0",
          state: "done",
          label: `Request · ${quoted(session.prompt)} · sent`,
        },
      });
    exchange.forEach((entry, i) => {
      if (entry.from !== "person") return;
      const how =
        entry.source === "voice"
          ? "Voice"
          : entry.source === "typed"
            ? "Typed"
            : "You";
      timed.push({
        at: entry.at,
        step: entry.pending
          ? {
              id: `ask-${i}`,
              state: "working",
              label: `${how} · ${quoted(entry.text)} · not read yet`,
            }
          : {
              id: `ask-${i}`,
              state: "done",
              label: `${how} · ${quoted(entry.text)} · ${entry.source === "voice" ? "heard" : "sent"}`,
            },
      });
    });
    (session.tools ?? []).forEach((call, i) =>
      timed.push({
        at: call.at,
        step: {
          id: `tool-${i}`,
          state: call.state === "working" && ended ? "unknown" : call.state,
          label: toolLabel(call, ended),
        },
      }),
    );
    // A stable sort: equal times keep their order (a request before its tools).
    timed.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
    steps.push(...timed.map((t) => t.step));
    steps.push(...(session.approvals ?? []).map((a) => approvalStep(a, now)));
  }
  steps.push(
    ...jobs.map((job): DeckStep => ({
      id: `job-${job.id}`,
      state: "working",
      label: job.line,
    })),
  );
  if (session) steps.push(...statusStep(session, steps));
  return steps.slice(-DECK_STEPS_MAX);
}

/** The glyph each state shows in the deck, beside its word. */
export const DECK_STEP_GLYPH: Record<DeckStepState, string> = {
  done: "✓",
  working: "›",
  waiting: "…",
  failed: "✗",
  unknown: "?",
};

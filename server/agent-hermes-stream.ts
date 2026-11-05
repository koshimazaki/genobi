// Reads Hermes' stream-JSON output (`hermes chat -q … --format stream-json`)
// into the same updates as Claude Code's (agent-stream.ts). Hermes' events,
// per its docs (reference/cli-commands.md, "--format stream-json"):
// `system`/`init` (model, session id), `text` (a streamed delta of the
// answer), `tool_use` (name), `tool_result` (name, output, is_error) and one
// terminal `result` (exit_code, text, error). Text deltas are gathered into
// whole paragraphs before they become lines. Anything else is skipped.
// `init` and `result` both carry `session_id` (hermes_cli/stream_json.py,
// v0.21.4); `result`'s is the newer one after mid-run compression. It is
// kept for Continue (`hermes chat --resume <id>`, issue #58) only once the
// run answered something: a start that failed before any turn has none.
import {
  AGENT_LINE_CHARS,
  AGENT_SPEND_CODE,
} from "../shared/agent-session-events";
import {
  clean,
  cleanSummary,
  toolDetail,
  toolName,
  type StreamUpdate,
} from "./agent-stream";

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Text held back for one line is bounded; a longer run is a line of its own. */
const HELD_CHARS = AGENT_LINE_CHARS * 4;

/**
 * A Hermes session id as `hermes chat --resume` takes it (such as
 * `20261102_022539_f15678`): never a flag, never the `latest` keyword, so a
 * resume can only ever name this exact conversation.
 */
export const HERMES_SESSION_ID =
  /^(?!latest$)[A-Za-z0-9][A-Za-z0-9_.:-]{5,127}$/i;
const sessionIdOf = (value: unknown) =>
  typeof value === "string" && HERMES_SESSION_ID.test(value)
    ? value
    : undefined;

/** A reader for one session: it keeps the text between events. */
export function hermesReader() {
  let held = "";
  let conversation: string | undefined;
  let answered = false;
  /** The id, once, when the run first does something. */
  const mark = (): StreamUpdate[] => {
    if (answered || !conversation) return [];
    answered = true;
    return [{ runnerSession: conversation }];
  };
  const flush = (all: boolean): StreamUpdate[] => {
    const parts = held.split(/\n\s*\n/);
    held = all ? "" : (parts.pop() ?? "");
    return parts
      .map((part) => clean(part))
      .filter(Boolean)
      .map((line) => ({ line }));
  };
  return (raw: string): StreamUpdate[] => {
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!isObject(event)) return [];
    if (event.type === "system" && event.subtype === "init") {
      conversation = sessionIdOf(event.session_id);
      const model =
        typeof event.model === "string" ? clean(event.model, 80) : "";
      return [
        {
          started: true,
          line: model ? `Hermes on ${model}.` : "Hermes started.",
        },
      ];
    }
    if (event.type === "text") {
      if (typeof event.text !== "string") return [];
      held += event.text;
      const first = mark();
      if (held.length > HELD_CHARS) return [...first, ...flush(true)];
      return [...first, ...(/\n\s*\n/.test(held) ? flush(false) : [])];
    }
    if (event.type === "tool_use") {
      const name = clean(toolName(event.name), 60);
      const detail = name ? toolDetail(name, event.input) : undefined;
      return [
        ...mark(),
        ...flush(true),
        ...(name
          ? [
              {
                line: `Using ${name}`,
                tool: {
                  phase: "started" as const,
                  name,
                  ...(detail ? { detail } : {}),
                },
              },
            ]
          : []),
      ];
    }
    if (event.type === "tool_result") {
      const output = typeof event.output === "string" ? event.output : "";
      const name = clean(toolName(event.name), 60);
      // Hermes gives no call id: the name pairs the result with its call.
      const tool = {
        phase:
          event.is_error === true ? ("failed" as const) : ("done" as const),
        ...(name ? { name } : {}),
      };
      if (output.includes(AGENT_SPEND_CODE))
        return [
          ...flush(true),
          {
            refusedSpend: true,
            line: "A paid step needs your approval in the studio.",
            tool,
          },
        ];
      return event.is_error === true
        ? [
            ...flush(true),
            { line: `A tool refused: ${clean(output, 160)}`, tool },
          ]
        : [...flush(true), { tool }];
    }
    if (event.type === "result") {
      const failed = event.exit_code !== 0;
      const text = typeof event.text === "string" ? event.text : "";
      const signIn =
        typeof event.error === "string" && /credential/i.test(event.error);
      // A run that answered keeps the newest id (compression rotates it).
      const kept = answered || !failed;
      conversation = (kept && sessionIdOf(event.session_id)) || conversation;
      const resumable =
        kept && conversation ? [{ runnerSession: conversation }] : [];
      answered = true;
      return [
        ...resumable,
        ...flush(true),
        {
          finished: failed ? "failed" : "done",
          ...(text.trim()
            ? { summary: cleanSummary(text) }
            : failed
              ? {
                  summary: signIn
                    ? "Hermes could not sign in. Run `hermes -p genobi auth add <provider>` (docs/agent-setup.md)."
                    : "The agent stopped before it finished.",
                }
              : {}),
        },
      ];
    }
    return [];
  };
}

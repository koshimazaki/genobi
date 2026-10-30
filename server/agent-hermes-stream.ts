// Reads Hermes' stream-JSON output (`hermes chat -q … --format stream-json`)
// into the same updates as Claude Code's (agent-stream.ts). Hermes' events,
// per its docs (reference/cli-commands.md, "--format stream-json"):
// `system`/`init` (model, session id), `text` (a streamed delta of the
// answer), `tool_use` (name), `tool_result` (name, output, is_error) and one
// terminal `result` (exit_code, text, error). Text deltas are gathered into
// whole paragraphs before they become lines. Anything else is skipped.
import {
  AGENT_LINE_CHARS,
  AGENT_SPEND_CODE,
} from "../shared/agent-session-events";
import {
  clean,
  cleanSummary,
  toolName,
  type StreamUpdate,
} from "./agent-stream";

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Text held back for one line is bounded; a longer run is a line of its own. */
const HELD_CHARS = AGENT_LINE_CHARS * 4;

/** A reader for one session: it keeps the text between events. */
export function hermesReader() {
  let held = "";
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
      if (held.length > HELD_CHARS) return flush(true);
      return /\n\s*\n/.test(held) ? flush(false) : [];
    }
    if (event.type === "tool_use") {
      const name = toolName(event.name);
      return [
        ...flush(true),
        ...(name ? [{ line: `Using ${clean(name, 60)}` }] : []),
      ];
    }
    if (event.type === "tool_result") {
      const output = typeof event.output === "string" ? event.output : "";
      if (output.includes(AGENT_SPEND_CODE))
        return [
          ...flush(true),
          {
            refusedSpend: true,
            line: "A paid step needs your approval in the studio.",
          },
        ];
      return event.is_error === true
        ? [...flush(true), { line: `A tool refused: ${clean(output, 160)}` }]
        : flush(true);
    }
    if (event.type === "result") {
      const failed = event.exit_code !== 0;
      const text = typeof event.text === "string" ? event.text : "";
      const signIn =
        typeof event.error === "string" && /credential/i.test(event.error);
      return [
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

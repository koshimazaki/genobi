// Reads Claude Code's stream-JSON output (`claude -p --output-format
// stream-json`), one event per line, into what the studio shows: short
// progress lines, the final summary and how the run ended. Anything it does
// not recognise is skipped, so a new event type cannot break a session.
import {
  AGENT_LINE_CHARS,
  AGENT_SPEND_CODE,
  AGENT_SUMMARY_CHARS,
} from "../shared/agent-session-events";

export interface StreamUpdate {
  line?: string;
  summary?: string;
  /** The runner said it is up: the session is running. */
  started?: true;
  finished?: "done" | "failed";
  /** A paid route refused this agent; the person has to approve. */
  refusedSpend?: true;
}

/** One line of text: control characters and runs of space collapsed. */
export function clean(text: string, max = AGENT_LINE_CHARS) {
  // Control characters are stripped on purpose, as the server's sanitisers do.
  const flat = text.replace(/[\x00-\x1f\x7f\s]+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The summary keeps its paragraphs; everything else as `clean`. */
export function cleanSummary(text: string) {
  const kept = text
    .replace(/[\x00-\x09\x0b-\x1f\x7f]+/g, " ")
    .replace(/[ \t]*\n\s*\n\s*/g, "\n\n")
    .trim();
  return kept.length > AGENT_SUMMARY_CHARS
    ? `${kept.slice(0, AGENT_SUMMARY_CHARS - 1)}…`
    : kept;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** `mcp__genobi__genobi_quote` reads as `genobi_quote` (Claude Code and Hermes). */
export const toolName = (name: unknown) =>
  typeof name === "string" ? name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "") : "";

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isObject(part) && typeof part.text === "string" ? part.text : "",
    )
    .join(" ");
}

function initLine(event: Record<string, unknown>): StreamUpdate[] {
  const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers : [];
  const named = (status: (s: string) => boolean) =>
    servers
      .filter(isObject)
      .filter((s) => typeof s.status === "string" && status(s.status))
      .map((s) => clean(String(s.name ?? ""), 40))
      .filter(Boolean);
  const up = named((s) => s === "connected");
  const down = named((s) => s !== "connected");
  return [
    { started: true, line: `Connected: ${up.join(", ") || "no tools"}.` },
    ...(down.length ? [{ line: `Could not start: ${down.join(", ")}.` }] : []),
  ];
}

function assistantLines(message: unknown): StreamUpdate[] {
  const content = isObject(message) ? message.content : undefined;
  if (!Array.isArray(content)) return [];
  return content.filter(isObject).flatMap((part): StreamUpdate[] => {
    if (part.type === "text" && typeof part.text === "string") {
      const line = clean(part.text);
      return line ? [{ line }] : [];
    }
    if (part.type === "tool_use") {
      const name = toolName(part.name);
      return name ? [{ line: `Using ${clean(name, 60)}` }] : [];
    }
    return [];
  });
}

function toolResults(message: unknown): StreamUpdate[] {
  const content = isObject(message) ? message.content : undefined;
  if (!Array.isArray(content)) return [];
  return content
    .filter(isObject)
    .filter((part) => part.type === "tool_result" && part.is_error === true)
    .map((part) => {
      const text = resultText(part.content);
      return text.includes(AGENT_SPEND_CODE)
        ? {
            refusedSpend: true as const,
            line: "A paid step needs your approval in the studio.",
          }
        : { line: `A tool refused: ${clean(text, 160)}` };
    });
}

/** The updates one stream-JSON line carries; none for anything else. */
export function readStreamLine(raw: string): StreamUpdate[] {
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isObject(event)) return [];
  if (event.type === "system" && event.subtype === "init")
    return initLine(event);
  if (event.type === "assistant") return assistantLines(event.message);
  if (event.type === "user") return toolResults(event.message);
  if (event.type === "result") {
    const failed = event.is_error === true || event.subtype !== "success";
    const text = typeof event.result === "string" ? event.result : "";
    return [
      {
        finished: failed ? "failed" : "done",
        ...(text.trim()
          ? { summary: cleanSummary(text) }
          : failed
            ? { summary: "The agent stopped before it finished." }
            : {}),
      },
    ];
  }
  return [];
}

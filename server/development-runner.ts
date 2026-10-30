import type { DevelopmentRunner } from "../shared/development-session";
import { baseEnv, type LaunchPlan } from "./agent-runner";
import { hermesReader } from "./agent-hermes-stream";
import { readStreamLine, type StreamUpdate } from "./agent-stream";

/** Fixed executable and arguments only; neither paths nor shell commands come from HTTP. */
export function developmentPlan(
  runner: DevelopmentRunner,
  command: string,
  cwd: string,
  prompt: string,
  nativeId?: string,
): LaunchPlan {
  const args =
    runner === "codex"
      ? [
          "exec",
          "-c",
          'sandbox_mode="workspace-write"',
          "-c",
          'approval_policy="never"',
          ...(nativeId ? ["resume", nativeId] : []),
          "--json",
          "-",
        ]
      : runner === "claude"
        ? [
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--permission-mode",
            "dontAsk",
            ...(nativeId ? ["--resume", nativeId] : []),
          ]
        : [
            "chat",
            "--query-file",
            "-",
            "--oneshot",
            "--format",
            "stream-json",
            "--no-restore-cwd",
            ...(nativeId ? ["--resume", nativeId] : []),
          ];
  return { command, args, cwd, env: baseEnv(process.env), stdin: prompt };
}

export function safeDevelopmentText(text: string) {
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .replace(/(bearer\s+)[\w.\-/+=]+/gi, "$1[redacted]")
    .replace(
      /\b(?:sk|hf|ghp|gho|github_pat)[_-][A-Za-z0-9_-]{12,}/g,
      "[redacted]",
    )
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[redacted]",
    )
    .slice(0, 8000);
}

export function developmentReader(runner: DevelopmentRunner) {
  const read = runner === "hermes" ? hermesReader() : readStreamLine;
  return (raw: string): { nativeId?: string; updates: StreamUpdate[] } => {
    if (raw.length > 1_000_000) return { updates: [] };
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return { updates: [] };
    }
    if (!event || typeof event !== "object") return { updates: [] };
    const id =
      event.type === "thread.started"
        ? event.thread_id
        : (event.type === "system" && event.subtype === "init") ||
            event.type === "result"
          ? event.session_id
          : undefined;
    const nativeId =
      typeof id === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(id)
        ? id
        : undefined;
    if (runner !== "codex") return { nativeId, updates: read(raw) };
    const item = event.item;
    const updates: StreamUpdate[] = [];
    if (event.type === "thread.started")
      updates.push({ started: true, line: "Codex connected." });
    if (
      event.type === "item.completed" &&
      item?.type === "agent_message" &&
      typeof item.text === "string"
    )
      updates.push({ line: item.text, summary: item.text });
    if (
      event.type === "item.started" &&
      typeof item?.type === "string" &&
      item.type !== "reasoning"
    )
      updates.push({ line: `Using ${item.type}` });
    if (event.type === "turn.failed" || event.type === "error")
      updates.push({
        finished: "failed",
        line: "Codex could not complete the turn. Check its login and permissions.",
      });
    return { nativeId, updates };
  };
}

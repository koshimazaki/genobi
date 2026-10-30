import type { LogEvent, RunRecord, SessionRead } from "./agent-log.mjs";

export class ReadError extends Error {
  constructor(message: string, kind: "connection" | "server" | "rate" | "http");
  kind: "connection" | "server" | "rate" | "http";
}
export const RETRIES: number;
export const RATE_WAIT_MAX_MS: number;
export function describe(events: LogEvent[], record: RunRecord): string;
export function watch(options: {
  read: () => Promise<SessionRead>;
  record: RunRecord;
  intervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onChange?: (record: RunRecord, events: LogEvent[]) => Promise<void>;
}): Promise<number>;

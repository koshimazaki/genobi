export const LINES_MAX: number;

export interface LogEvent {
  at: string;
  kind: string;
  text: string;
}
export interface StepView {
  status: string;
  estimateUsd?: number;
  jobId?: string;
}
export interface RunRecord {
  label: string;
  note?: string;
  runner?: string;
  sessionId?: string;
  prompt?: string;
  startedAt?: string;
  endedAt?: string;
  status?: string;
  summary?: string;
  outcome?: string;
  window: string[];
  lines: number;
  gaps: number;
  approvals: Record<string, StepView>;
  results: Record<string, { status: string; jobId?: string }>;
  events: LogEvent[];
}
/** The parts of an `AgentSession` (shared/agent-session.ts) the log reads. */
export interface SessionRead {
  id: string;
  runner: string;
  status: string;
  prompt: string;
  startedAt: string;
  summary?: string;
  lines: string[];
  approvals?: {
    quoteId: string;
    status: string;
    estimateUsd: number;
    expiresAt: string;
    jobId?: string;
    message?: string;
    plan: {
      entry: string;
      model?: string;
      route: string;
      duration?: number;
    };
  }[];
  results?: { quoteId: string; status: string; jobId?: string }[];
}

export function clean(value: unknown, max?: number): string;
export function mergeLines(
  previous: string[],
  current: string[],
): { added: string[]; gap: boolean };
export function newRecord(options?: {
  label?: string;
  note?: string;
}): RunRecord;
export function observe(
  record: RunRecord,
  session: SessionRead,
  at: string,
): LogEvent[];
export function settled(
  record: RunRecord,
  session: SessionRead,
  now: number,
): { code: number; outcome: string } | undefined;
export function finish(record: RunRecord, outcome: string, at: string): void;
export function tally(record: RunRecord): {
  quoted: number;
  approved: number;
  declined: number;
  expired: number;
  refused: number;
  pending: number;
  estimate: number;
};
export function logName(record: RunRecord): string;
export function renderLog(record: RunRecord): string;

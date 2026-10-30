import type { AgentMemoryOptions } from "./agent-memory";
// The agent sessions' shapes (server/agent-sessions.ts): what the server
// passes in, what a running session keeps, and what an agent's studio
// request may read beyond its own session.
import type { ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";
import type { AgentSession } from "../shared/agent-session";
import type { ApprovalResult } from "../shared/agent-approval";
import type { SetupFacts } from "../shared/agent-setup";
import type { AgentConfig } from "./agent-config";
import type { ApprovalService, Proposal } from "./agent-approvals";
import type { ProcessRow, Reaper } from "./agent-reap";
import type { LaunchPlan, RunnerHandlers } from "./agent-runner";
import type { SourceAccess } from "./agent-scope";
import type { SettingsSnapshot } from "./workflow-settings";
import type { AgentTerminal, terminalPlan } from "./agent-terminal";

export interface AgentSessionsOptions {
  config: AgentConfig;
  /**
   * The native launcher for `mode: "terminal"` starts: the supervisor's
   * `DevelopmentTerminal`, which app.ts sets on the sessions once mounted.
   */
  terminal?: AgentTerminal;
  /** Tests replace the Terminal session's plan. */
  terminalPlan?: typeof terminalPlan;
  /** Reads `config` again before each status read and start (no restart). */
  refresh?: () => Promise<void>;
  memory?: AgentMemoryOptions;
  /** The studio's own origin, such as http://127.0.0.1:4431. */
  studioOrigin: string;
  /** A one-use link code for a copy the owner holds (project-links). */
  link: (copyId: string, owner: string) => { code: string };
  /** Tests replace the spawn and the signal. */
  launch?: (
    plan: LaunchPlan,
    on: RunnerHandlers,
  ) => Pick<ChildProcess, "pid"> & {
    stdin?: Pick<Writable, "write" | "end"> | null;
  };
  /** How long a live session waits for a message after a reply; tests shorten it. */
  idleMs?: number;
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  /** How long Stop waits before SIGKILL; tests shorten it. */
  graceMs?: number;
  /** How often a tracked runner's descendants are listed; tests shorten it. */
  sampleMs?: number;
  /** Tests replace the process table. */
  table?: () => Promise<ProcessRow[]>;
  /** The job service's side of approving a quoted step (app.ts). */
  approvals?: ApprovalService;
  /** True when the person's studio session owns this job (a picked take). */
  owns?: (jobId: string, owner: string) => boolean;
  /** How "these settings"' upscale source may be used (`SourceAccess`). */
  sourceAccess?: (sourceId: string, owner: string) => Promise<SourceAccess>;
  /**
   * The person's run location and workflow templates, read at start, and
   * the same settings written into each of the agent's studio sessions.
   */
  settings?: {
    snapshot: (owner: string) => SettingsSnapshot;
    adopt: (sessionId: string, snapshot: SettingsSnapshot) => void;
  };
  /**
   * For setup's start (`request.setup`): the key slots this server holds and
   * its voice model folder (`server/agent-setup-facts.ts`).
   */
  setupFacts?: () => Promise<SetupFacts>;
}

/** What an agent's studio request may do beyond its own session. */
export interface AgentScope {
  /** The person whose session started the agent. */
  owner: string;
  /** The agent session's own id, as the studio's bubble shows it. */
  agentSession: string;
  memorySession?: string;
  memoryCopyId?: string;
  /** Their picked takes, which the agent may poll and read, nothing else. */
  readable: ReadonlySet<string>;
}

export interface Running {
  view: AgentSession;
  copyId?: string;
  owner: string;
  pid?: number;
  /** Ends the runner's process group, and the groups of the children it
   * started, even after the runner exits (agent-reap.ts). */
  reaper?: Reaper;
  workdir?: string;
  timer?: NodeJS.Timeout;
  stopping?: boolean;
  timedOut?: boolean;
  finished?: "done" | "failed";
  refusedSpend?: boolean;
  /** The token its Genobi MCP server sends as `X-Genobi-Agent-Run`. */
  grant?: string;
  /** A live runner's stdin, open for the person's next message. */
  input?: Pick<Writable, "write" | "end">;
  /** The runner reads turns on stdin, even once its input closed. */
  streams?: boolean;
  /** Turns written and not yet answered. */
  turns?: number;
  idleMs?: number;
  /** Closes the input after a reply with no further message. */
  idleTimer?: NodeJS.Timeout;
  /** A Terminal session: stops reading its window's receipt. */
  unwatch?: () => void;
  /** A Terminal session's private folder (plan, grant file, receipt). */
  terminalFolder?: string;
  /**
   * The ids the agent may read as the person's (`server/agent-scope.ts`):
   * the picked takes and the settings' upscale source they own.
   */
  readable: Set<string>;
  /** The person's settings at start, for the agent's studio sessions. */
  snapshot?: SettingsSnapshot;
  /** The agent's studio sessions that already took that snapshot. */
  bound: Set<string>;
  /** Paid steps it quoted, for the person to approve or decline. */
  approvals: Proposal[];
  /** What each approval came to, by quote id, past the visible six. */
  results: Map<string, ApprovalResult>;
}

import { AgentMemory } from "./agent-memory";
import { AgentInbox, collectQueued, dropQueued } from "./agent-inbox";
type MessageSource = "voice" | "typed";
// Project-prompt sessions on the local server (issue #23): one running agent
// per studio session, its recent progress in memory, tickets that sign the
// agent's own browser in, and the sessions marked as an agent's so the paid
// routes can refuse them. Project context and bounded history persist separately.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AgentRunnerStatus,
  AgentSessionRequest,
} from "../shared/agent-session";
import {
  AGENT_SESSION_ID,
  isAgentActive,
} from "../shared/agent-session-events";
import { runnerStatus } from "./agent-config";
import { OpenRouteError } from "./agent-hermes-pins";
import { Reaper } from "./agent-reap";
import { launch, type SessionPlanInput } from "./agent-runner";
import { pushLine, settleEnded, viewOf } from "./agent-session-end";
import {
  closeInput,
  deliver,
  IDLE_MS,
  openInput,
  record,
  turnEnded,
} from "./agent-conversation";
import { AgentTickets } from "./agent-tickets";
import {
  openTerminalSession,
  releaseAfterStop,
  releaseTerminal,
  terminalRefused,
} from "./agent-session-terminal";
import {
  assertCapacity,
  notFound,
  RUNNERS,
  shuttingDown,
} from "./agent-runner-table";
import type { StreamUpdate } from "./agent-stream";
import { AppError } from "./errors";
import { propose, type SetSource } from "./agent-approvals";
import { approveStep, declineStep } from "./agent-session-steps";
import { type ApprovalPayer } from "../shared/agent-approval";
import type { Quote } from "../shared/quote";
import type { GenerateInput } from "../shared/types";
import { scopedContext } from "./agent-scope";
import type {
  AgentScope,
  AgentSessionsOptions,
  Running,
} from "./agent-session-types";
import { resolveContextPhrases } from "../shared/agent-context-phrases";

/** Sessions kept for reading, running or not, and those running at once. */
const KEPT = 20;
const RUNNING_MAX = 2;
const MARKED_MAX = 256;
/** How long a stopped runner has to close its browser before SIGKILL. */
const GRACE_MS = 5_000;
/** How often a Hermes session's descendants are listed (agent-reap.ts). */
const SAMPLE_MS = 1_000;

export type { AgentScope, AgentSessionsOptions } from "./agent-session-types";

export class AgentSessions {
  private sessions = new Map<string, Running>();
  private tickets = new AgentTickets();
  /** Studio sessions a ticket made (an agent's browser), to their session. */
  private marked = new Map<string, string>();
  /** Set by close(): no new session starts, and starts in flight drain. */
  private closing = false;
  private starting = new Set<Promise<unknown>>();
  private memory: AgentMemory;
  /** Messages for runners without live input (Box 1.8). */
  readonly inbox = new AgentInbox();
  /** Opens `mode: "terminal"` starts; app.ts sets it with the dev routes. */
  terminal: AgentSessionsOptions["terminal"];
  constructor(private options: AgentSessionsOptions) {
    this.memory = new AgentMemory(options.memory);
    this.terminal = options.terminal;
  }

  async status(): Promise<AgentRunnerStatus> {
    await this.options.refresh?.();
    const status = await runnerStatus(this.options.config);
    // Whether a start may ask for a Terminal window (macOS only).
    return this.terminal?.supported ? { ...status, terminal: true } : status;
  }

  /** True for a studio session an agent's browser holds. */
  isAgent(sessionId: string) {
    return this.marked.has(sessionId);
  }

  /** Resolve the active grant and adopt its run settings once. */
  scope(sessionId: string, grant?: string): AgentScope | undefined {
    const ticketed = this.marked.get(sessionId);
    const session = ticketed
      ? this.sessions.get(ticketed)
      : grant
        ? [...this.sessions.values()].find((s) => s.grant === grant)
        : undefined;
    if (!session || !isAgentActive(session.view.status)) return undefined;
    if (!session.bound.has(sessionId)) {
      session.bound.add(sessionId);
      if (session.snapshot)
        this.options.settings?.adopt(sessionId, session.snapshot);
    }
    return {
      owner: session.owner,
      agentSession: session.view.id,
      readable: session.readable,
      // Only a project-linked runner has a memory session record.
      memorySession: session.copyId ? session.view.id : undefined,
      memoryCopyId: session.copyId,
    };
  }

  /** `relayed`: a start from the hosted studio (runner-connection.ts). */
  start(owner: string, request: AgentSessionRequest, relayed = false) {
    const started = this.begin(owner, request, relayed);
    this.starting.add(started);
    void started.finally(() => this.starting.delete(started)).catch(() => {});
    return started;
  }

  private async begin(
    owner: string,
    request: AgentSessionRequest,
    relayed: boolean,
  ) {
    if (this.closing) throw shuttingDown();
    const status = await this.status();
    // Every await comes before the capacity check: from the check until the
    // session is registered (`keep`) nothing yields, so concurrent starts
    // cannot all pass it.
    const sourceId = request.context?.settings?.sourceId;
    const sourceAccess = sourceId
      ? await this.options.sourceAccess?.(sourceId, owner)
      : undefined;
    if (this.closing) throw shuttingDown();
    if (!status.available || !status.runner)
      throw new AppError(
        503,
        status.message ?? "No agent is set up.",
        "agent_unavailable",
      );
    const runner = RUNNERS[status.runner];
    if (request.mode === "terminal" && (relayed || !this.terminal?.supported))
      throw terminalRefused();
    assertCapacity(
      [...this.sessions.values()].filter((s) => isAgentActive(s.view.status)),
      owner,
      RUNNING_MAX,
    );
    // Minted before anything is spawned: a copy the owner does not hold is a 404.
    const linkCode = request.copyId
      ? this.options.link(request.copyId, owner).code
      : undefined;
    // Only what the person owns stays in the context; the agent may read
    // exactly that (`readableIds`).
    const { context, readable } = scopedContext(
      request.context,
      owner,
      this.options.owns ?? (() => false),
      sourceAccess,
      // Asset picks are offered from the linked project only.
      request.copyId?.split(".")[0],
    );
    const id = randomUUID();
    const session: Running = {
      owner,
      approvals: [],
      results: new Map(),
      readable,
      snapshot: this.options.settings?.snapshot(owner),
      bound: new Set(),
      view: {
        id,
        runner: status.runner,
        status: "starting",
        prompt: request.prompt,
        startedAt: new Date().toISOString(),
        lines: [`Starting ${runner.label}…`],
      },
    };
    record(session, "person", request.prompt);
    this.keep(id, session);
    try {
      const projectMemory = await this.memory.begin(session, request.copyId);
      session.workdir = await mkdtemp(path.join(os.tmpdir(), "genobi-agent-"));
      // Setup's start: the facts come from this server, never the request.
      // A relayed start never names a local folder (relayRequest also
      // refuses `setup`), so nothing machine-specific reaches the hosted side.
      const facts = request.setup
        ? ((await this.options.setupFacts?.()) ?? { keys: [] })
        : undefined;
      const setup = facts && {
        harness: runner.label,
        facts: relayed ? { keys: facts.keys } : facts,
      };
      const input: SessionPlanInput = {
        ...(setup ? { setup } : {}),
        // "My last two picks" and "these settings" arrive with their ids.
        prompt: resolveContextPhrases(request.prompt, context).prompt,
        ...(context ? { context } : {}),
        ...(projectMemory ? { projectMemory } : {}),
        studioOrigin: this.options.studioOrigin,
        ticketUrl: `${this.options.studioOrigin}/api/agent/ticket/${this.tickets.issue(id)}`,
        ...(linkCode ? { linkCode } : {}),
        workdir: session.workdir,
        ...(request.signIn && { signIn: request.signIn }),
      };
      if (request.mode === "terminal")
        return await this.openTerminal(session, input);
      const plan = await runner.plan(this.options.config, input);
      // Shutdown may have begun while the plan was prepared; launch nothing.
      if (this.closing) {
        this.fail(session, "The studio is shutting down.");
        return viewOf(session);
      }
      const read = runner.reader();
      const child = (this.options.launch ?? launch)(plan, {
        line: (raw) => this.consume(session, read(raw)),
        exit: (code) => void this.ended(session, code),
        error: () => this.fail(session, `${runner.label} could not start.`),
      });
      session.pid = child.pid;
      session.grant = plan.grant;
      if (plan.turns === "stream")
        openInput(session, child.stdin, this.options.idleMs ?? IDLE_MS);
      if (child.pid)
        session.reaper = new Reaper(child.pid, {
          track: !!plan.tracksDescendants,
          kill: this.options.kill ?? process.kill.bind(process),
          graceMs: this.options.graceMs ?? GRACE_MS,
          sampleMs: this.options.sampleMs ?? SAMPLE_MS,
          ...(this.options.table ? { table: this.options.table } : {}),
          ...(plan.runToken ? { token: plan.runToken } : {}),
        });
      session.timer = setTimeout(() => {
        session.timedOut = true;
        this.signal(session);
      }, this.options.config.timeoutMs);
      session.timer.unref();
    } catch (error) {
      this.fail(
        session,
        error instanceof OpenRouteError || error instanceof AppError
          ? error.message
          : `${runner.label} could not start.`,
      );
    }
    return viewOf(session);
  }

  /** The harness in a Terminal window the person drives (agent-terminal.ts). */
  private async openTerminal(session: Running, input: SessionPlanInput) {
    const options = { ...this.options, terminal: this.terminal };
    await openTerminalSession(options, session, input, {
      closing: () => this.closing,
      ended: (code) => void this.ended(session, code),
    });
    return viewOf(session);
  }

  read(id: string, owner: string) {
    const saved = this.sessions.has(id)
      ? undefined
      : this.memory.read(id, owner);
    return saved ?? viewOf(this.owned(id, owner));
  }

  /**
   * A quote the running session's Genobi MCP server took becomes a step for
   * the person. Ignored for an unknown grant or a session that has ended.
   */
  propose(
    grant: string,
    input: GenerateInput,
    quote: Quote,
    quoteSession: string,
    payer: () => ApprovalPayer,
    source?: SetSource,
    sourceSession = quoteSession,
  ) {
    const session = [...this.sessions.values()].find(
      (s) => s.grant === grant && isAgentActive(s.view.status),
    );
    if (!session) return;
    try {
      session.approvals = propose(
        session.approvals,
        input,
        quote,
        quoteSession,
        payer(),
        source,
        sourceSession,
      );
    } catch (error) {
      // Too many steps in flight: said in the session, nothing dropped.
      if (error instanceof AppError) pushLine(session, error.message);
      // Nobody can pay, or an upscale without its measured source: no step.
      return;
    }
    pushLine(
      session,
      quote.billing
        ? `A paid step is waiting for your approval: ${quote.billing}${quote.recipe.deployment ? ` (${quote.recipe.deployment.name})` : ""}.`
        : `A paid step is waiting for your approval: about $${quote.estimateUsd.toFixed(2)}.`,
    );
  }

  /** The person's Approve: the quoted run, once, in their own session. */
  approve(id: string, owner: string, quoteId: string, key: string) {
    const session = this.owned(id, owner);
    return approveStep(session, this.options.approvals, owner, quoteId, key);
  }

  decline(id: string, owner: string, quoteId: string) {
    const session = this.owned(id, owner);
    return declineStep(session, this.options.approvals, quoteId);
  }

  private consume(session: Running, updates: StreamUpdate[]) {
    for (const update of updates) {
      if (update.started && session.view.status === "starting")
        session.view.status = "running";
      if (update.line) pushLine(session, update.line);
      if (update.summary) {
        session.view.summary = update.summary;
        record(session, "agent", update.summary);
      }
      if (update.refusedSpend) session.refusedSpend = true;
      if (update.finished) {
        session.finished = update.finished;
        turnEnded(session);
      }
    }
    void this.memory.progress(session).catch(() => {
      this.signal(session);
      this.fail(session, "Project memory could not be saved; session stopped.");
    });
  }

  /** Stops the owner's session: its own process group, never another. */
  stop(id: string, owner: string) {
    const session = this.owned(id, owner);
    if (isAgentActive(session.view.status) && !session.stopping) {
      session.stopping = true;
      pushLine(session, "Stopping…");
      this.signal(session);
    }
    return viewOf(session);
  }

  /**
   * The owner's further message, handed to the running session. With its
   * `source`, a runner without live input gets it queued in `inbox` for its
   * Genobi MCP server (`deliver`); without, it is refused.
   */
  message(id: string, owner: string, text: string, source?: MessageSource) {
    const session = this.owned(id, owner);
    deliver(
      session,
      text,
      source && ((at, words) => void this.inbox.post(at, words, source)),
    );
    return viewOf(session);
  }

  /** The owner's running session's queued messages, once each. */
  collect(owner: string) {
    const view = this.active(owner);
    return view ? collectQueued(this.sessions.get(view.id)!, this.inbox) : [];
  }

  /**
   * Spends a ticket: a new studio session id, marked as an agent's, or
   * undefined when the ticket is unknown, used, expired or its run is over.
   */
  redeem(ticket: string) {
    const id = this.tickets.take(ticket);
    const session = id ? this.sessions.get(id) : undefined;
    if (!id || !session || !isAgentActive(session.view.status)) return;
    const marked = randomUUID();
    this.marked.set(marked, id);
    if (this.marked.size > MARKED_MAX)
      this.marked.delete(this.marked.keys().next().value!);
    this.scope(marked);
    return marked;
  }

  /** Drain starts, process cleanup and durable progress before shutdown. */
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.starting]);
    await Promise.all(
      [...this.sessions.values()].map((session) => session.reaper?.reap()),
    );
    for (const session of this.sessions.values())
      if (isAgentActive(session.view.status)) {
        session.unwatch?.();
        await releaseTerminal(session, false);
        session.view.status = "interrupted";
        await this.memory.finish(session);
      }
    await this.memory.drain();
  }

  private owned(id: string, owner: string) {
    const session = AGENT_SESSION_ID.test(id)
      ? this.sessions.get(id)
      : undefined;
    if (!session || session.owner !== owner) throw notFound();
    return session;
  }

  /**
   * The owner's running session, if any: a reload finds it again (a
   * Terminal session outlives the page), and a refused start names it.
   */
  active(owner: string) {
    const session = [...this.sessions.values()].find(
      (s) => s.owner === owner && isAgentActive(s.view.status),
    );
    return session && viewOf(session);
  }

  private keep(id: string, session: Running) {
    this.sessions.set(id, session);
    for (const [key, old] of this.sessions) {
      if (this.sessions.size <= KEPT) break;
      if (!isAgentActive(old.view.status)) this.sessions.delete(key);
    }
  }

  /**
   * Stop and the time limit: end a runner that is still running. A Terminal
   * window is the person's: the studio stops following it (its grant no
   * longer reaches this session), and the window stays open.
   */
  private signal(session: Running) {
    closeInput(session);
    if (session.pid) void session.reaper?.reap();
    else if (session.unwatch) {
      session.unwatch();
      session.unwatch = undefined;
      pushLine(session, "The Terminal window stays open until you close it.");
      releaseAfterStop(session);
      void this.ended(session, null);
    }
  }

  private fail(session: Running, message: string) {
    if (!isAgentActive(session.view.status)) return;
    session.view.status = "failed";
    session.view.summary ??= message;
    pushLine(session, message);
    void this.finish(session);
  }

  private async ended(session: Running, code: number | null) {
    session.pid = undefined;
    closeInput(session);
    void session.reaper?.reap();
    if (!isAgentActive(session.view.status)) return this.finish(session);
    settleEnded(session, code, this.options.config.timeoutMs);
    await this.finish(session);
  }

  private async finish(session: Running) {
    clearTimeout(session.timer);
    dropQueued(session, this.inbox);
    try {
      await this.memory.finish(session);
    } catch {
      pushLine(
        session,
        "Project memory could not be saved. Last durable checkpoint retained.",
      );
    }
    this.tickets.forget(session.view.id);
    closeInput(session);
    const workdir = session.workdir;
    session.workdir = undefined;
    if (workdir) await rm(workdir, { recursive: true, force: true });
    // A Terminal window kept open after Stop still writes its receipt there.
    if (!session.stopping) await releaseTerminal(session, true);
  }
}

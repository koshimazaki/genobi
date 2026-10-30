import { APPROVAL_TIMEOUT_MS, type ChainView } from "../shared/chain";
import { expectedHeaders, settingsHold } from "./settings-store";
import { QUOTE_TTL_MS } from "../shared/quote";
import type { OutputTargetId } from "../shared/output-targets";
import type { GenerateInput } from "../shared/types";
import {
  isActive,
  type ChainAction,
  type ChainEntry,
  type ChainReply,
  type RunMode,
} from "./chain-state";

/** A refused chain request: its status, the server's message and code. */
export class ChainRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export interface ChainBody {
  stages: { input: GenerateInput; consumes?: number }[];
  target?: OutputTargetId;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The chain routes from `server/chains.ts` and `worker/chains.ts`. The key is
 * read per request from page memory and sent as a header, as jobs send it; it
 * is never stored here.
 */
export function chainClient(fetchImpl: Fetch, key: () => string) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const current = key();
    const response = await fetchImpl(`/api/chains${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(current ? { "x-byo-key": current } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ChainRequestError(
        response.status,
        data.error || "The chain request could not be completed.",
        data.code || "request_failed",
      );
    return data as T;
  }
  return {
    list: async () => {
      const data = await call<{ chains?: unknown }>("");
      // A fixture or an older server may answer without a list.
      return Array.isArray(data.chains) ? (data.chains as ChainView[]) : [];
    },
    read: (id: string) => call<ChainReply>(`/${encodeURIComponent(id)}`),
    // Both name the settings the studio shows (`expectedHeaders`) for the
    // stage they price or run: its run location and, for a workflow model,
    // its template, so a swap made elsewhere is refused, not run.
    create: (body: ChainBody) =>
      call<ChainReply>("", {
        method: "POST",
        body: JSON.stringify(body),
        headers: expectedHeaders(body.stages[0]?.input),
      }),
    approve: (id: string, quoteId: string, input?: GenerateInput) =>
      call<ChainReply>(`/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "Quote-Id": quoteId, ...expectedHeaders(input) },
      }),
    cancel: (id: string) =>
      call<ChainReply>(`/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  };
}

export type ChainClient = ReturnType<typeof chainClient>;

export const NEEDS_KEY = "needs_key";
/** Approval refused while the settings are saving or restoring. */
export const SETTINGS_HELD = "settings_held";

/**
 * How long past its quote's expiry a lost approval might still reserve work:
 * the margin `APPROVAL_TIMEOUT_MS` in `shared/chain.ts` adds for Worker
 * clocks that disagree.
 */
export const APPROVAL_CLOCK_MARGIN_MS = APPROVAL_TIMEOUT_MS - QUOTE_TTL_MS;

/** Recovery reads after a lost answer: 2 s, doubling, at most every 30 s. */
export const RECOVERY_MS = 2_000;
export const RECOVERY_MAX_MS = 30_000;

type Schedule = (run: () => void, ms: number) => () => void;
const timeout: Schedule = (run, ms) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

const refusal = (error: unknown) =>
  error instanceof ChainRequestError
    ? { message: error.message, code: error.code }
    : { message: "The studio connection is unavailable.", code: "network" };

/**
 * Create, read, approve and cancel, as actions on the chain state. Every paid
 * step is the person's: nothing here approves on its own, and a refused
 * approval is recorded and never sent again. Reading the chain after a refusal
 * is free and shows where it really stands.
 */
export function chainController({
  client,
  dispatch,
  canSend,
  onStageStarted,
  now = Date.now,
  schedule = timeout,
}: {
  client: ChainClient;
  dispatch: (action: ChainAction) => void;
  /**
   * A key in page memory, or a server key: a POST can be sent. With a stage's
   * input, also a stage planned for the local ComfyUI, which needs no key.
   */
  canSend: (input?: GenerateInput) => boolean;
  /**
   * A stage job the job list must pick up and poll. `show` is true once, for
   * the stage this page approved; other calls only register (or retry).
   * Answering false keeps the hand-off, which is tried again with backoff.
   */
  onStageStarted?: (
    jobId: string,
    show: boolean,
  ) => boolean | void | Promise<boolean | void>;
  now?: () => number;
  /** Runs a recovery read later; tests run them by hand. */
  schedule?: Schedule;
}) {
  const pending = new Map<string, () => void>();
  /** Chains whose last approval's answer is still unknown. */
  const recovering = new Set<string>();
  /**
   * The stage each approval this page sent is waiting to see as a job. A
   * stage can answer `submitting` with no job yet (or its answer can be lost),
   * so whichever read first shows the job hands it to the poller, once: a paid
   * run is never left uncollected.
   */
  const awaiting = new Map<string, number>();
  /** Hand-offs in progress or waiting to retry, by job id. */
  const handing = new Map<string, () => void>();
  /** Stage jobs the poller already has: each is handed over once. */
  const registered = new Set<string>();
  /**
   * Hands a stage's job to the poller and keeps the hand-off until the job is
   * registered: a failed registration (its free read failed) is retried with
   * backoff, so a paid run is never left unpolled. `show` is true only for
   * the stage this page's approval started, and only on the first try.
   */
  async function handOff(jobId: string, show: boolean, attempt = 0) {
    handing.set(jobId, () => {});
    let ok: boolean;
    try {
      ok = (await onStageStarted?.(jobId, show && attempt === 0)) !== false;
    } catch {
      ok = false;
    }
    if (ok) {
      handing.delete(jobId);
      registered.add(jobId);
      return;
    }
    const delay = Math.min(RECOVERY_MAX_MS, RECOVERY_MS * 2 ** attempt);
    handing.set(
      jobId,
      schedule(() => void handOff(jobId, show, attempt + 1), delay),
    );
  }
  /**
   * Every stage job a chain shows goes to the poller, once, whoever started
   * it: this page's approval, or one claimed before a reload whose job is
   * reserved later. Only the stage this page approved is shown.
   */
  function collect(reply: ChainReply) {
    const { id, stages } = reply.chain;
    const at = awaiting.get(id);
    if (at !== undefined && !stages[at]?.jobId && !recovering.has(id)) {
      // Paused again (a lapsed approval) or cancelled: nothing ran. While a
      // lost approval is recovered, a pause may only mean its claim has not
      // landed yet, so the stage stays awaited.
      if (stages[at]?.status !== "submitting") awaiting.delete(id);
    }
    stages.forEach(({ jobId }, index) => {
      if (!jobId || registered.has(jobId) || handing.has(jobId)) return;
      const mine = index === at;
      if (mine) awaiting.delete(id);
      void handOff(jobId, mine);
    });
  }
  /**
   * After an approval without an answer: read the chain (free), backing off
   * between tries, until its outcome is known. A read that still shows the
   * stage paused may come before the lost approval's claim lands, so reading
   * goes on until the stage leaves its pause or the approval can no longer
   * reserve work: its quote's expiry plus the clock margin chains allow
   * (`APPROVAL_TIMEOUT_MS`). A stage it started goes to the job poller; the
   * approval itself is never sent again.
   */
  async function recover(
    id: string,
    stage: number,
    deadline: number,
    attempt = 0,
  ) {
    pending.delete(id);
    recovering.add(id);
    const reply = await read(id);
    const at = reply?.chain.stages[stage];
    const settled =
      reply !== undefined &&
      (!at || Boolean(at.jobId) || at.status !== "paused" || now() > deadline);
    if (settled) {
      recovering.delete(id);
      // Re-read the answer with the recovery over: a pause past the
      // deadline releases the awaited stage.
      collect(reply);
      return;
    }
    dispatch({ type: "uncertain", id });
    const delay = Math.min(RECOVERY_MAX_MS, RECOVERY_MS * 2 ** attempt);
    pending.set(
      id,
      schedule(() => void recover(id, stage, deadline, attempt + 1), delay),
    );
  }
  async function read(id: string): Promise<ChainReply | undefined> {
    dispatch({ type: "busy", id, busy: "read" });
    try {
      const reply = await client.read(id);
      dispatch({ type: "reply", reply });
      collect(reply);
      return reply;
    } catch (error) {
      dispatch({ type: "refused", id, ...refusal(error) });
      return undefined;
    }
  }
  return {
    read,
    /** Stops waiting recovery reads, when the studio goes away. */
    dispose() {
      for (const cancel of pending.values()) cancel();
      pending.clear();
      recovering.clear();
      awaiting.clear();
      for (const cancel of handing.values()) cancel();
      handing.clear();
      registered.clear();
    },
    async load() {
      const chains = await client.list();
      dispatch({ type: "listed", chains });
      for (const chain of chains) collect({ chain });
      // A list carries statuses only; an open pause needs its quote.
      for (const chain of chains.filter(isActive).slice(0, 6))
        await read(chain.id);
    },
    /** Creating is free: the server validates every stage and quotes stage 1. */
    async start(
      body: ChainBody,
      meta: { origin: RunMode; draftJobId?: string },
    ) {
      if (!canSend(body.stages[0]?.input))
        throw new ChainRequestError(
          400,
          "Connect your key to price this chain.",
          NEEDS_KEY,
        );
      const reply = await client.create(body);
      dispatch({ type: "reply", reply, ...meta, focus: true });
      return reply.chain;
    },
    async approve(entry: ChainEntry) {
      const { id, quote, pausedAt } = entry.chain;
      const refuse = (message: string, code: string) =>
        dispatch({ type: "refused", id, message, code });
      // The controller's own record decides, so a stale entry cannot slip by.
      if (entry.uncertain || recovering.has(id))
        return refuse(
          "The last approval's answer was lost. Checking where this chain stands before anything else is sent.",
          "approval_uncertain",
        );
      if (!canSend(entry.chain.stages[pausedAt ?? -1]?.input))
        return refuse("Connect your key to approve this stage.", NEEDS_KEY);
      // The same hold as Generate: a run location or workflow still being
      // saved or restored is not what this approval would send.
      const hold = settingsHold();
      if (hold)
        return refuse(
          hold === "restoring"
            ? "This run's settings are still being restored. Approve once they are set."
            : hold === "checking"
              ? "The studio is checking the run location or workflow. Approve once it is confirmed."
              : "The run location or workflow is still being saved. Approve once it is confirmed.",
          SETTINGS_HELD,
        );
      if (!quote || pausedAt === undefined)
        return refuse(
          "This stage has no live quote to approve.",
          "quote_missing",
        );
      if (Date.parse(quote.expiresAt) <= now())
        return refuse(
          "This quote expired. Refresh it before approving.",
          "quote_expired",
        );
      dispatch({ type: "busy", id, busy: "approve" });
      // Recorded before sending, so even a lost answer leaves the stage to find.
      awaiting.set(id, pausedAt);
      let reply: ChainReply;
      try {
        reply = await client.approve(
          id,
          quote.id,
          entry.chain.stages[pausedAt]?.input,
        );
      } catch (error) {
        dispatch({ type: "refused", id, ...refusal(error) });
        // A refusal the server answered (below 500) reserved nothing: one
        // free read shows the chain. Without an answer the approval may
        // still start its stage, so it is recovered until that is known;
        // either way the approval itself is never sent again.
        if (error instanceof ChainRequestError && error.status < 500)
          await read(id);
        else
          await recover(
            id,
            pausedAt,
            Date.parse(quote.expiresAt) + APPROVAL_CLOCK_MARGIN_MS,
          );
        return;
      }
      dispatch({ type: "reply", reply });
      collect(reply);
    },
    async cancel(entry: ChainEntry) {
      const { id } = entry.chain;
      if (entry.uncertain || recovering.has(id))
        return dispatch({
          type: "refused",
          id,
          message:
            "The last approval's answer was lost. Checking where this chain stands first.",
          code: "approval_uncertain",
        });
      // Cancelling sends nothing paid: a chain this page could start keyless
      // can be cancelled keyless too.
      if (!entry.chain.stages.some((stage) => canSend(stage.input)))
        return dispatch({
          type: "refused",
          id,
          message: "Connect your key to cancel this chain.",
          code: NEEDS_KEY,
        });
      dispatch({ type: "busy", id, busy: "cancel" });
      try {
        dispatch({ type: "reply", reply: await client.cancel(id) });
      } catch (error) {
        dispatch({ type: "refused", id, ...refusal(error) });
        await read(id);
      }
    },
  };
}

export type ChainController = ReturnType<typeof chainController>;

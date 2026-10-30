import type { ChainView } from "../shared/chain";

/**
 * What the studio knows about each chain: the server's view of it (statuses
 * and the live pause quote come from there, never from here), plus the few
 * things only this page knows: which mode started it, the draft a Studio
 * review continues, a refused approval's message, and a request in flight.
 */
export type RunMode = "fast" | "studio";

export interface ChainEntry {
  chain: ChainView;
  /** The pause has no quote because no key was available to price it. */
  needsKey?: boolean;
  /** The route refused to quote the pause (`pauseError` beside the chain). */
  pauseError?: { error: string; code: string };
  /** The last refused request: shown, never retried. */
  refusal?: { message: string; code: string };
  busy?: "approve" | "cancel" | "read";
  /**
   * An approval's answer and the read after it were both lost, so whether its
   * stage started is unknown. Free reads keep trying; nothing is approved or
   * cancelled until one answers.
   */
  uncertain?: boolean;
  /** How this page started it; absent for chains loaded from history. */
  origin?: RunMode;
  /** The ready take a Studio review is upscaling. */
  draftJobId?: string;
}

export interface ChainsState {
  entries: Record<string, ChainEntry>;
  /** Newest first. */
  order: string[];
  /** The chain the review step shows, when one was chosen explicitly. */
  focusId: string | null;
}

export interface ChainReply {
  chain: ChainView;
  needsKey?: true;
  pauseError?: { error: string; code: string };
}

export type ChainAction =
  | { type: "listed"; chains: ChainView[] }
  | {
      type: "reply";
      reply: ChainReply;
      origin?: RunMode;
      draftJobId?: string;
      focus?: boolean;
    }
  | { type: "busy"; id: string; busy: ChainEntry["busy"] }
  | { type: "refused"; id: string; message: string; code: string }
  | { type: "uncertain"; id: string }
  | { type: "focus"; id: string | null };

export const emptyChains: ChainsState = {
  entries: {},
  order: [],
  focusId: null,
};

export const isActive = (chain: ChainView) =>
  chain.status === "paused" || chain.status === "running";

/**
 * The take a chain upscales from the start: a Studio review's chain is one
 * upscale whose input names the take (its asset id is its job's id). Read
 * from the chain itself, so a chain loaded from history after a reload still
 * knows the draft it continues.
 */
export function sourceTake(chain: ChainView): string | undefined {
  const first = chain.stages[0];
  return first?.input.generator === "upscale" && first.consumes === undefined
    ? first.input.sourceId
    : undefined;
}

export function chainsReducer(
  state: ChainsState,
  action: ChainAction,
): ChainsState {
  switch (action.type) {
    case "listed": {
      // History never overwrites what this page already holds: a list view
      // carries no quote, and the entry may hold a newer read.
      const entries = { ...state.entries };
      const order = [...state.order];
      for (const chain of action.chains) {
        if (entries[chain.id]) continue;
        const draftJobId = sourceTake(chain);
        entries[chain.id] = { chain, ...(draftJobId ? { draftJobId } : {}) };
        order.push(chain.id);
      }
      return { ...state, entries, order };
    }
    case "reply": {
      const { chain, needsKey, pauseError } = action.reply;
      const previous = state.entries[chain.id];
      const moved =
        previous &&
        (previous.chain.status !== chain.status ||
          previous.chain.pausedAt !== chain.pausedAt);
      // The take a review continues: kept, given, or read from the chain.
      const draftJobId =
        previous?.draftJobId ?? action.draftJobId ?? sourceTake(chain);
      const entry: ChainEntry = {
        ...previous,
        chain,
        needsKey: needsKey === true,
        pauseError,
        // A refusal stays until the chain moves on or the person acts again.
        refusal: moved ? undefined : previous?.refusal,
        busy: undefined,
        // A server answer is the chain's real state.
        uncertain: undefined,
        ...(action.origin ? { origin: action.origin } : {}),
        ...(draftJobId ? { draftJobId } : {}),
      };
      return {
        entries: { ...state.entries, [chain.id]: entry },
        order: previous
          ? state.order
          : [chain.id, ...state.order.filter((id) => id !== chain.id)],
        focusId: action.focus ? chain.id : state.focusId,
      };
    }
    case "busy": {
      const entry = state.entries[action.id];
      if (!entry) return state;
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.id]: {
            ...entry,
            busy: action.busy,
            // Acting again retires the last refusal.
            ...(action.busy === "read" ? {} : { refusal: undefined }),
          },
        },
      };
    }
    case "refused": {
      const entry = state.entries[action.id];
      if (!entry) return state;
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.id]: {
            ...entry,
            busy: undefined,
            refusal: { message: action.message, code: action.code },
          },
        },
      };
    }
    case "uncertain": {
      const entry = state.entries[action.id];
      if (!entry) return state;
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.id]: { ...entry, busy: undefined, uncertain: true },
        },
      };
    }
    case "focus":
      return { ...state, focusId: action.id };
  }
}

/** The chain one of whose stages ran `jobId`, or whose review continues it. */
export function chainForJob(state: ChainsState, jobId: string) {
  for (const id of state.order) {
    const entry = state.entries[id];
    if (
      entry.draftJobId === jobId ||
      entry.chain.stages.some((stage) => stage.jobId === jobId)
    )
      return entry;
  }
  return undefined;
}

/** The take a chain's review shows: its newest stage job, else its draft. */
export function reviewTake(entry: ChainEntry): string | undefined {
  const ran = entry.chain.stages.filter((stage) => stage.jobId);
  return ran.at(-1)?.jobId ?? entry.draftJobId;
}

/** Whether `jobId` is one of the chain's takes: a stage's job or its draft. */
const holds = (entry: ChainEntry, jobId: string | undefined) =>
  jobId !== undefined &&
  (entry.draftJobId === jobId ||
    entry.chain.stages.some((stage) => stage.jobId === jobId));

/**
 * The chain the review step may show over the main view, so its Approve is
 * never over another clip. A focused chain shows over one of its own takes,
 * or anywhere while it has none yet (a Fast chain before its first stage);
 * otherwise the chain the shown run belongs to.
 */
export function reviewFor(state: ChainsState, heroJobId: string | undefined) {
  const focused = state.focusId ? state.entries[state.focusId] : undefined;
  if (focused && (!reviewTake(focused) || holds(focused, heroJobId)))
    return focused;
  return heroJobId ? chainForJob(state, heroJobId) : undefined;
}

/**
 * A chain still acting on this take: waiting, running or finished. Its
 * review stands for the take, so closing it must not reopen the take's own
 * draft review; a cancelled or failed chain leaves the take free to review.
 */
export function liveChainFor(state: ChainsState, jobId: string) {
  return state.order
    .map((id) => state.entries[id])
    .find(
      (entry) =>
        holds(entry, jobId) &&
        entry.chain.status !== "cancelled" &&
        entry.chain.status !== "failed",
    );
}

/** A stage's plain name: the first video pass, or the upscale after it. */
export function stageName(chain: ChainView, index: number) {
  const { input } = chain.stages[index];
  if (input.generator === "upscale") return `Upscale ${input.upscaleFactor}×`;
  if (input.generator === "video") return input.draft ? "Draft" : "Video";
  return "Image";
}

/** What the card and the review step say about a chain, in one line. */
export function chainSummary(entry: ChainEntry) {
  const { chain } = entry;
  const total = chain.stages.length;
  const at =
    chain.status === "paused"
      ? (chain.pausedAt ?? 0)
      : Math.max(
          0,
          chain.stages.findIndex(
            (stage) =>
              stage.status === "running" || stage.status === "submitting",
          ),
        );
  const stage = `Stage ${at + 1} of ${total} · ${stageName(chain, at)}`;
  switch (chain.status) {
    case "paused":
      return `${stage} · waiting for approval`;
    case "running":
      return `${stage} · running`;
    case "complete":
      return `All ${total} ${total === 1 ? "stage" : "stages"} ready`;
    case "failed":
      return "A stage failed; nothing was retried";
    case "cancelled":
      return "Cancelled at a pause; nothing more runs";
  }
}

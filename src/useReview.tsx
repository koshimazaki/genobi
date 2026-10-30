import { useEffect, useState } from "react";
import type { OutputTargetId } from "../shared/output-targets";
import type { GenerateInput, Job, Source } from "../shared/types";
import { NEEDS_KEY } from "./chain-client";
import {
  isActive,
  liveChainFor,
  reviewFor,
  reviewTake,
  type RunMode,
} from "./chain-state";
import ReviewStep from "./components/ReviewStep";
import {
  fastChain,
  fastFrame,
  reviewable,
  studioUpscale,
  takeSource,
} from "./review";
import type { ComposerState } from "./useComposer";
import { useChains } from "./useChains";
import { smoothScroll } from "./scroll";

/** Existing chain history and its explicit review/approval surface. Camera
 * generates directly and has no Fast/Studio switch or automatic draft review. */
export function useReview({
  key,
  hasServerKey,
  connection,
  heroJob,
  sources,
  selectedId,
  selectJob,
  trackJob,
  catalogueId,
  onConnectKey,
  onShowVideo,
  composer,
  offerUpscale = false,
}: {
  key: string;
  hasServerKey: boolean;
  /** Moves on every saved server key change; see `useServerKey`. */
  connection: number;
  /** The visitor's run the main view shows, if it shows one. */
  heroJob?: Job;
  sources: Source[];
  selectedId: string | null;
  selectJob: (id: string) => void;
  /** Puts a job in the poller's list by its own free read; false if it failed. */
  trackJob: (id: string) => Promise<boolean>;
  /** The library clip the main view shows instead of a run, if any. */
  catalogueId: string | null;
  onConnectKey: () => void;
  /**
   * Holds the composer in Text to video, where the review step lives, as an
   * edit of its own, so the restore of a selected run (an upscale stage, say)
   * cannot switch it away. `reveal` also brings the Camera preset forward.
   */
  onShowVideo: (reveal: boolean) => void;
  /** The composer, whose entry and frame a target is fitted to. */
  composer: ComposerState;
  /** Camera keeps upscale explicit; only opt in on a dedicated review surface. */
  offerUpscale?: boolean;
}) {
  const [mode, setMode] = useState<RunMode>("studio");
  const [target, setTarget] = useState<OutputTargetId>("1080p");
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  /** Every take the review selects, a started stage included, goes here. */
  const showTake = (jobId: string, reveal = false) => {
    onShowVideo(reveal);
    selectJob(jobId);
  };
  // A started stage is shown once, so the main view follows the chain, and
  // registered with the poller until that succeeds (retried on failure).
  const chains = useChains(key, hasServerKey, connection, (jobId, show) => {
    if (show) showTake(jobId);
    return trackJob(jobId);
  });
  const { state, focus } = chains;
  useEffect(() => {
    // Choosing another run hands the review step back to that run; selecting
    // the stage this chain just started keeps the chain.
    const held = state.focusId ? state.entries[state.focusId] : undefined;
    if (
      held &&
      selectedId &&
      (held.draftJobId === selectedId ||
        held.chain.stages.some((stage) => stage.jobId === selectedId))
    )
      return;
    focus(null);
    setQuoteError("");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A library clip in the main view is not any chain's take.
    if (!catalogueId) return;
    focus(null);
    setQuoteError("");
  }, [catalogueId]); // eslint-disable-line react-hooks/exhaustive-deps
  const found = reviewFor(state, heroJob?.id);
  const entry = found && !dismissed.has(found.chain.id) ? found : undefined;
  const draft =
    offerUpscale &&
    !entry &&
    mode === "studio" &&
    heroJob &&
    reviewable(heroJob) &&
    !dismissed.has(heroJob.id) &&
    // Closing a chain over this take must not reopen it as a fresh draft.
    !liveChainFor(state, heroJob.id)
      ? { job: heroJob, source: takeSource(heroJob, sources) }
      : undefined;
  const ticking = entry?.chain.status === "paused" && entry.chain.quote;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [ticking]);
  const dismiss = (id: string) =>
    setDismissed((current) => new Set(current).add(id));
  async function quote() {
    if (!draft?.source) return;
    const body = studioUpscale(draft.job, draft.source, target);
    if ("reason" in body) return setQuoteError(body.reason);
    setQuoting(true);
    setQuoteError("");
    try {
      await chains.start(body, { origin: "studio", draftJobId: draft.job.id });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === NEEDS_KEY)
        onConnectKey();
      setQuoteError(
        error instanceof Error
          ? error.message
          : "The upscale could not be priced.",
      );
    } finally {
      setQuoting(false);
    }
  }
  const review =
    entry || draft ? (
      <ReviewStep
        entry={entry}
        draft={draft}
        target={target}
        onTarget={setTarget}
        quoting={quoting}
        quoteError={quoteError}
        now={now}
        onQuote={() => void quote()}
        onApprove={(item) => void chains.approve(item)}
        onCancel={(item) => void chains.cancel(item)}
        onRefresh={(item) => void chains.read(item.chain.id)}
        onConnectKey={onConnectKey}
        onClose={() => {
          if (entry) dismiss(entry.chain.id);
          else if (draft) dismiss(draft.job.id);
          focus(null);
        }}
      />
    ) : null;
  const fast = mode === "fast" && composer.generator === "video";
  return {
    mode,
    setMode,
    target,
    setTarget,
    /** In Fast, the toolbar's ratio and resolution follow the target. */
    frameLock: fast ? fastFrame(target, composer) : null,
    review,
    /** Chains this page started, and any still open from before. */
    cards: state.order
      .map((id) => state.entries[id])
      .filter((item) => item.origin || isActive(item.chain)),
    /**
     * A chain card's Review: the video composer, the chain's newest take (the
     * latest stage that ran, else the draft a Studio review continues) in the
     * main view, then the review step over it. A Fast chain still waiting on
     * its first stage has no take yet, so the view keeps what it shows.
     */
    openChain(id: string) {
      const entry = state.entries[id];
      if (!entry) return;
      setDismissed((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      focus(id);
      // Selectable when it is a stage's job or a generated clip, whose asset
      // id is its job's; an upload or library source has no run to select.
      const take = reviewTake(entry);
      const isRun =
        take !== undefined &&
        (entry.chain.stages.some((stage) => stage.jobId === take) ||
          sources.some((s) => s.id === take && s.origin === "generated"));
      if (isRun) return showTake(take, true);
      onShowVideo(true);
      document
        .getElementById("main-video")
        ?.scrollIntoView(smoothScroll("start"));
    },
    /** Fast: create the chain; its first paid stage waits for Approve. */
    startFast: (input: GenerateInput) =>
      chains.start(fastChain(input, target), { origin: "fast" }),
  };
}

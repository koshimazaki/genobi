import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  approvable,
  PAYER_LABEL,
  type AgentApproval,
  type ApprovalStatus,
} from "../../shared/agent-approval";
import type { AgentSession } from "../../shared/agent-session";
import { approvalHold, ApprovalHeld, approveStep, declineStep } from "./api";
import {
  announceApprovedJob,
  onHandoffsChanged,
  retryPendingHandoffs,
  stuckHandoffs,
} from "./approved-jobs";
import {
  mergeRecovered,
  onRecoveredSession,
  recoverApproval,
  useRecoveredSession,
  useRecovering,
} from "./approval-recovery";
import { useSettingsHold, type SettingsHold } from "../settings-store";
import "./agent-approvals.css";

const CLOSED: Record<Exclude<ApprovalStatus, "pending">, string> = {
  submitting: "Approved. Starting the run…",
  started: "Approved. The run started; it is in your gallery.",
  declined: "Declined. Nothing ran.",
  expired: "The quote expired. Nothing ran.",
  refused: "Not run.",
  uncertain: "Approved, but the run could not be confirmed.",
};

const LOCATION: Record<string, string> = {
  local: "this machine's ComfyUI",
  cloud: "Comfy Cloud",
  deployment: "a Comfy API deployment",
};
const ROUTE: Record<string, string> = {
  router: "Comfy Router",
  bfl: "BFL",
  workflow: "a Comfy workflow",
};

/** "FLUX 3 · Video, 5 s, 16:9, hd · Comfy Router". */
export function planLine(approval: AgentApproval) {
  const p = approval.plan;
  const where = p.location ? LOCATION[p.location] : ROUTE[p.route];
  // An upscale: its measured source, the factor and creativity it sends.
  if (p.upscale) {
    const u = p.upscale;
    return [
      p.label,
      `${u.factor}× ${u.creativity}`,
      `“${u.sourceLabel}” ${u.width}×${u.height}, ${u.duration.toFixed(1)} s → ${u.outputWidth}×${u.outputHeight}${u.parts ? `, in ${u.parts} parts joined with its sound` : ""}`,
      where,
    ].join(" · ");
  }
  const shape = [
    p.duration !== undefined ? `${p.duration} s` : "",
    p.aspectRatio ?? "",
    p.resolution ?? "",
    p.draft ? "Draft" : "",
    p.referenceCount ? `${p.referenceCount} reference image(s)` : "",
    p.guide ? `Guide: ${p.guide.label} (${p.guide.duration.toFixed(1)} s)` : "",
  ].filter(Boolean);
  return [p.label, shape.join(", "), where].filter(Boolean).join(" · ");
}

/** Shown in full: a long prompt opens behind "Show the full prompt". */
const PROMPT_PREVIEW = 400;
export function ApprovalPrompt({ text }: { text: string }) {
  if (text.length <= PROMPT_PREVIEW)
    return <p className="agent-approval-prompt">“{text}”</p>;
  return (
    <details className="agent-approval-prompt">
      <summary>
        “{text.slice(0, PROMPT_PREVIEW)}…” Show the full prompt (
        {text.length.toLocaleString("en")} characters)
      </summary>
      <p>“{text}”</p>
    </details>
  );
}

const seconds = (approval: AgentApproval, now: number) =>
  Math.max(0, Math.round((Date.parse(approval.expiresAt) - now) / 1000));

/**
 * The paid steps an agent quoted, each with what it will run, its price and
 * whose key pays. Nothing runs until Approve; an expired step cannot be
 * approved, and the server checks the quote, the settings and the key again.
 */
export function AgentApprovals({
  session: given,
  onChange,
  settingsHold,
}: {
  session: AgentSession;
  onChange: (session: AgentSession) => void;
  /** What holds Approve; the settings store's own by default. */
  settingsHold?: SettingsHold;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<{ quoteId: string; text: string }>();
  const live = useSettingsHold();
  const hold = approvalHold(settingsHold ?? live);
  // Read-only recovery after a lost or failed Approve answer, one per step,
  // owned outside this view (`recoverApproval`): tucking the bubble away
  // never stops it, and reopening resumes any step still being sent.
  // What a recovery read back while the bubble was tucked away wins over
  // the panel's older copy of a step.
  const recovered = useRecoveredSession(given.id);
  const session = mergeRecovered(given, recovered);
  const recovering = useRecovering(session.id);
  // A paid run the gallery has not received yet, after many tries: shown.
  const stuck = useSyncExternalStore(
    onHandoffsChanged,
    stuckHandoffs,
    stuckHandoffs,
  );
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(
    () =>
      onRecoveredSession((next) => {
        if (next.id === session.id) changed.current(next);
      }),
    [session.id],
  );
  const submitting = (session.approvals ?? [])
    .filter((a) => a.status === "submitting")
    .map((a) => a.quoteId)
    .join(",");
  useEffect(() => {
    for (const quoteId of submitting.split(",").filter(Boolean))
      recoverApproval(session.id, quoteId);
  }, [session.id, submitting]);
  const approvals = session.approvals ?? [];
  const waiting = approvals.some((a) => approvable(a, now));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  const notice = stuck.length ? (
    <p className="agent-error agent-handoff" role="alert">
      A paid run could not be shown yet.{" "}
      <button type="button" onClick={retryPendingHandoffs}>
        Refresh history
      </button>
    </p>
  ) : null;
  if (!approvals.length) return notice;

  async function act(approval: AgentApproval, yes: boolean) {
    if (busy) return;
    setBusy(approval.quoteId);
    setError(undefined);
    try {
      if (yes) {
        const { session: next, job } = await approveStep(
          session.id,
          approval.quoteId,
          approval.plan,
        );
        onChange(next);
        // A split upscale starts its parts, not one run to announce.
        if (job) announceApprovedJob({ id: job.id, job });
      } else onChange(await declineStep(session.id, approval.quoteId));
    } catch (failure) {
      // Never resent: the server's own words, and the step's outcome read
      // back until it is known. A held Approve sent nothing to read back.
      setError({ quoteId: approval.quoteId, text: (failure as Error).message });
      if (!(failure instanceof ApprovalHeld))
        recoverApproval(session.id, approval.quoteId);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      {notice}
      <ol
        className="agent-approvals"
        aria-label="Paid steps for you to approve"
      >
        {approvals.map((approval) => {
          const open = approvable(approval, now);
          const status = open
            ? undefined
            : approval.status === "pending"
              ? CLOSED.expired
              : CLOSED[approval.status];
          const left = seconds(approval, now);
          return (
            <li key={approval.quoteId} data-status={approval.status}>
              <div className="agent-source">
                {open ? "Waiting for your approval" : "Paid step"}
              </div>
              <p className="agent-approval-plan">{planLine(approval)}</p>
              {approval.plan.description && (
                <ApprovalPrompt text={approval.plan.description} />
              )}
              <dl className="agent-approval-terms">
                <dt>Estimated cost</dt>
                <dd>${approval.estimateUsd.toFixed(2)}</dd>
                <dt>Paid by</dt>
                <dd>{PAYER_LABEL[approval.payer]}</dd>
                {open && (
                  <>
                    <dt>Quote valid</dt>
                    <dd>
                      {Math.floor(left / 60)}:
                      {String(left % 60).padStart(2, "0")}
                    </dd>
                  </>
                )}
              </dl>
              {recovering.includes(approval.quoteId) && (
                <p className="agent-approval-status" role="status">
                  Checking what happened to this approval…
                </p>
              )}
              {status && (
                <p className="agent-approval-status" role="status">
                  {status}
                  {approval.message ? ` ${approval.message}` : ""}
                </p>
              )}
              {error?.quoteId === approval.quoteId && (
                <p className="agent-error" role="alert">
                  {error.text}
                </p>
              )}
              {open && hold && (
                <p className="agent-approval-status" role="status">
                  {hold}
                </p>
              )}
              {open && (
                <div className="agent-approval-actions">
                  <button
                    type="button"
                    className="agent-approve"
                    disabled={!!busy || !!hold}
                    title={hold}
                    onClick={() => void act(approval, true)}
                  >
                    {busy === approval.quoteId
                      ? "Approving…"
                      : `Approve $${approval.estimateUsd.toFixed(2)}`}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void act(approval, false)}
                  >
                    Decline
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

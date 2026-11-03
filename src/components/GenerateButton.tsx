import type { Generator, Job } from "../../shared/types";
import { isTerminal } from "../../shared/types";
import GenerationIndicator from "./GenerationIndicator";
import Icon from "./Icon";
import ProviderMenu from "./ProviderMenu";
import { useEffect } from "react";
import "../styles/generate-provider.css";
import "../styles/generate-queue.css";
import {
  loadSettings,
  useSettingsHold,
  type SettingsHold,
} from "../settings-store";

export default function GenerateButton({
  generator,
  submitting,
  activeJob,
  hasKey,
  disabled,
  onSubmit,
  onQueue,
  queued = 0,
  onClearQueue,
  onResume,
  providerChoices,
  providerValue,
  onProviderChange,
  onConfigure,
  hold: holdProp,
}: {
  generator: Generator;
  submitting: boolean;
  activeJob?: Job;
  hasKey: boolean;
  disabled: boolean;
  onSubmit: () => void;
  /** While a run is in flight, a click queues one more (`generation-queue.ts`). */
  onQueue?: () => void;
  /** Runs queued and not yet sent: the +N badge, which clears them. */
  queued?: number;
  onClearQueue?: () => void;
  onResume: () => void;
  /** Only show the split selector for image routes with a genuine choice. */
  providerChoices?: readonly { value: string; label: string }[];
  providerValue?: string;
  onProviderChange?: (value: string) => void;
  /** Open Studio settings to configure provider keys and Comfy run location. */
  onConfigure?: () => void;
  /** What holds Generate; read from the settings store unless given. */
  hold?: SettingsHold;
}) {
  // A Recreate restore or a settings save is not done: nothing may be sent.
  const stored = useSettingsHold();
  const hold = holdProp === undefined ? stored : holdProp;
  const restoring = Boolean(hold);
  useEffect(loadSettings, []);
  const waiting = activeJob && !isTerminal(activeJob.status);
  const needsKey = waiting && activeJob.keyMode === "byo" && !hasKey;
  const busy = submitting || Boolean(waiting && !needsKey);
  // Busy is not blocked when the queue is on: the click adds one more run.
  const queueable = busy && !needsKey && !restoring && !disabled && !!onQueue;
  const label = submitting
    ? "Sending…"
    : restoring && !needsKey
      ? hold === "restoring"
        ? "Restoring…"
        : hold === "checking"
          ? "Checking settings…"
          : "Saving settings…"
      : needsKey
        ? "Resume"
        : waiting
          ? activeJob.status === "copying"
            ? "Saving…"
            : activeJob.status === "Pending"
              ? "Queued…"
              : activeJob.status === "Reasoning"
                ? "Planning…"
                : generator === "upscale"
                  ? "Upscaling…"
                  : "Generating…"
          : generator === "upscale"
            ? "Upscale"
            : generator === "edit"
              ? "Generate edit"
              : "Generate";
  const button = (
    <button
      type="button"
      className={`generate-button${busy ? " is-generating" : ""}`}
      data-queueable={queueable || undefined}
      onClick={
        needsKey
          ? onResume
          : restoring
            ? undefined
            : queueable
              ? onQueue
              : onSubmit
      }
      // A run in flight cannot be called off: BFL has no cancel endpoint, so
      // the only thing a button here could stop is collecting what you paid
      // for. Hide the card instead; the poller keeps going.
      disabled={(busy && !queueable) || (!needsKey && (disabled || restoring))}
      aria-busy={busy}
      aria-label={queueable ? `Add to queue (${label})` : undefined}
      title={
        needsKey
          ? "Reconnect your key to finish this job"
          : queueable
            ? "Add one more run of this prompt to the queue"
            : waiting
              ? "This generation is still running"
              : hold === "restoring"
                ? "Restoring this run's workflow and run location"
                : hold
                  ? "Saving or confirming the run location and workflow"
                  : undefined
      }
    >
      <span className="generate-label">
        <span>{label}</span>
        {queueable && (
          <span className="generate-label__queue">Add to queue</span>
        )}
      </span>
      <span className="generate-button-icon" aria-hidden="true">
        {busy ? <GenerationIndicator /> : <Icon name="arrow" size={18} />}
      </span>
    </button>
  );
  // Beside the button, never inside it: positioned over its corner, so the
  // count neither nests a button nor moves the toolbar.
  const badge =
    queued > 0 && onClearQueue ? (
      <button
        type="button"
        className="generate-queue"
        onClick={onClearQueue}
        aria-label={`${queued} queued, not yet sent. Clear queue`}
        title="Queued runs, not yet sent. Click to clear the queue"
      >
        +{queued}
      </button>
    ) : null;
  const action = (
    <>
      {button}
      {badge}
    </>
  );
  if (!providerChoices?.length || !onProviderChange) return action;
  // Provider choice and API setup remain available when Generate lacks a prompt.
  return (
    <div className="generate-split">
      {action}
      <ProviderMenu
        choices={providerChoices}
        value={providerValue}
        disabled={busy || restoring}
        onChange={onProviderChange}
        onConfigure={onConfigure}
      />
    </div>
  );
}

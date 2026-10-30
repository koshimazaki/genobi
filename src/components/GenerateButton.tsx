import type { Generator, Job } from "../../shared/types";
import { isTerminal } from "../../shared/types";
import GenerationIndicator from "./GenerationIndicator";
import Icon from "./Icon";
import { useEffect } from "react";
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
  onResume,
  hold: holdProp,
}: {
  generator: Generator;
  submitting: boolean;
  activeJob?: Job;
  hasKey: boolean;
  disabled: boolean;
  onSubmit: () => void;
  onResume: () => void;
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
  return (
    <button
      className={`generate-button${busy ? " is-generating" : ""}`}
      onClick={needsKey ? onResume : restoring ? undefined : onSubmit}
      // A run in flight cannot be called off: BFL has no cancel endpoint, so
      // the only thing a button here could stop is collecting what you paid
      // for. Hide the card instead; the poller keeps going.
      disabled={busy || (!needsKey && (disabled || restoring))}
      aria-busy={busy}
      title={
        needsKey
          ? "Reconnect your key to finish this job"
          : waiting
            ? "This generation is still running"
            : hold === "restoring"
              ? "Restoring this run's workflow and run location"
              : hold
                ? "Saving or confirming the run location and workflow"
                : undefined
      }
    >
      <span>{label}</span>
      <span className="generate-button-icon" aria-hidden="true">
        {busy ? <GenerationIndicator /> : <Icon name="arrow" size={18} />}
      </span>
    </button>
  );
}

import type { Generator, Job } from "../../shared/types";
import { isTerminal } from "../../shared/types";
import GenerationIndicator from "./GenerationIndicator";
import Icon from "./Icon";
import { useEffect } from "react";
import "../styles/generate-provider.css";
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
  const action = (
    <button
      type="button"
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
  if (!providerChoices?.length || !onProviderChange) return action;
  const current = providerChoices.find(
    (choice) => choice.value === providerValue,
  );
  // Provider choice and API setup remain available when Generate lacks a prompt.
  return (
    <div className="generate-split">
      {action}
      <div className="generate-split__selector">
        <select
          aria-label="Generation provider"
          title={
            current
              ? `Generate with ${current.label}`
              : "Choose generation provider"
          }
          value={providerValue}
          disabled={busy || restoring}
          onChange={(event) => {
            if (event.currentTarget.value === "configure") onConfigure?.();
            else onProviderChange(event.currentTarget.value);
          }}
        >
          {providerChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
          {onConfigure && (
            <option value="configure">
              Configure API keys / run location…
            </option>
          )}
        </select>
        <span className="generate-split__provider" aria-hidden="true">
          {providerValue === "bfl"
            ? "BFL"
            : providerValue === "comfy"
              ? "COMFY"
              : "AUTO"}
        </span>
        <Icon name="chevron" size={10} />
      </div>
    </div>
  );
}

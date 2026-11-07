import type { ComposerState } from "../useComposer";
import { isImage, isKlein } from "../../shared/image";
import { isTerminal, type Job } from "../../shared/types";
import GenerateButton from "./GenerateButton";
import {
  providerPreference,
  selectableVideoProvider,
} from "../../shared/provider";

/** The preference for this generator, never borrowed from another lane. */
export const generationProviderFor = providerPreference;

/** Compose the provider route next to Generate without expanding App's UI tree. */
export default function GenerateAction({
  state,
  jobs,
  submitting,
  hasKey,
  recreating,
  disabled,
  onSubmit,
  onResume,
  onUpdate,
  onConfigure,
  queued,
  onClearQueue,
}: {
  state: ComposerState;
  jobs: Job[];
  submitting: boolean;
  hasKey: boolean;
  recreating: boolean;
  disabled: boolean;
  onSubmit: () => void;
  onResume: () => void;
  onUpdate: (changes: Partial<ComposerState>) => void;
  onConfigure?: () => void;
  /** Runs waiting in the generation queue; with `onClearQueue`, Generate queues while busy. */
  queued?: number;
  onClearQueue?: () => void;
}) {
  const { generator, model } = state;
  const video = selectableVideoProvider(generator, model);
  const providerChoices = video
    ? [
        { value: "auto", label: "Auto (BFL preferred)" },
        { value: "bfl", label: "BFL direct" },
        { value: "comfy", label: "Comfy Router" },
      ]
    : !isImage(generator)
      ? undefined
      : isKlein(model)
        ? [
            { value: "comfy", label: "Comfy workflow" },
            { value: "bfl", label: "BFL API" },
          ]
        : [
            { value: "auto", label: "Auto" },
            { value: "bfl", label: "BFL API" },
            { value: "comfy", label: "Comfy Router" },
          ];
  const providerValue = isKlein(model)
    ? model === "flux-3-klein"
      ? "comfy"
      : "bfl"
    : generationProviderFor(state);

  return (
    <GenerateButton
      generator={generator}
      submitting={submitting}
      activeJob={jobs.find(
        (job) => job.generator === generator && !isTerminal(job.status),
      )}
      hasKey={hasKey}
      hold={recreating ? "restoring" : undefined}
      disabled={disabled}
      providerChoices={providerChoices}
      providerValue={providerValue}
      onProviderChange={(value) =>
        video
          ? onUpdate({ videoProvider: value as "auto" | "bfl" | "comfy" })
          : isKlein(model)
            ? onUpdate({
                model: value === "bfl" ? "flux-3-klein-api" : "flux-3-klein",
              })
            : onUpdate({
                imageProvider: value as "auto" | "bfl" | "comfy",
              })
      }
      onSubmit={onSubmit}
      onQueue={onClearQueue ? onSubmit : undefined}
      queued={queued}
      onClearQueue={onClearQueue}
      onResume={onResume}
      onConfigure={onConfigure}
    />
  );
}

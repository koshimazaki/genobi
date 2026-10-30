import ImageControls from "./ImageControls";
import type { ReactNode } from "react";
import type { ComposerState } from "../useComposer";
import GenerationControls from "./GenerationControls";
import FamilyModelSelector from "./FamilyModelSelector";
import RunModeLine from "./RunModeLine";
import type { KeyKind } from "../../shared/provider";
import UpscaleControls from "./UpscaleControls";
import { ACOUSTIC_PAIR, entryFor, readyEntry } from "../../shared/registry";
import type { FrameLock } from "../review";
import { priceText } from "../balance-format";
import { CREDITS_PER_USD } from "../../shared/comfy/ltx";

/** Family and settings share Generate's baseline; model and cost balance below. */
export default function ComposerToolbar({
  state,
  update,
  estimate,
  estimateCredits,
  action,
  frameLock,
  keyKind = null,
}: {
  state: ComposerState;
  /** `useComposer`'s edit path, so every control here marks the edit. */
  update: (patch: Partial<ComposerState>) => void;
  /** USD per run, or null when there is nothing to price yet. */
  estimate: number | null;
  /** Comfy credits per run for an LTX entry; null for FLUX and the Upscaler. */
  estimateCredits: number | null;
  /** The Generate button. */
  action: ReactNode;
  /** Fast's frame, set by the Output target; see `fastFrame`. */
  frameLock?: FrameLock | null;
  /**
   * The key this run spends (`runPayer`): the run-mode tag and the price name
   * it. Null when no key held here can run the entry.
   */
  keyKind?: KeyKind | null;
}) {
  const { generator, model } = state;
  return (
    <div className="composer-toolbar composer-toolbar--balanced">
      <FamilyModelSelector
        generator={generator}
        model={model}
        openOnly={state.openOnly}
        onChoose={(choice) => update(choice)}
        onOpenOnlyChange={(openOnly) => update({ openOnly })}
      />
      <RunModeLine generator={generator} model={model} keyKind={keyKind} />
      <div className="toolbar-controls">
        {(generator === "image" || generator === "edit") && (
          <ImageControls
            state={state}
            update={update}
            hasRegions={state.imageRegions.length > 0}
          />
        )}
        <GenerationControls
          generator={generator}
          model={model}
          duration={state.duration}
          onDurationChange={(duration) => update({ duration })}
          aspectRatio={state.aspectRatio}
          onAspectRatioChange={(aspectRatio) => update({ aspectRatio })}
          resolution={state.resolution}
          onResolutionChange={(resolution) => update({ resolution })}
          cameraEnabled={state.cameraEnabled}
          onCameraEnabledChange={(cameraEnabled) => update({ cameraEnabled })}
          draft={state.draft}
          onDraftChange={(draft) => update({ draft })}
          frameLock={frameLock}
          onAcousticChange={(on) =>
            update({
              model: readyEntry(on ? ACOUSTIC_PAIR.on : ACOUSTIC_PAIR.off)!
                .videoModel,
            })
          }
        />
        {entryFor(generator, model).controls.kind === "upscale" && (
          <UpscaleControls
            factor={state.upscaleFactor}
            creativity={state.upscaleCreativity}
            open={entryFor(generator, model).route === "workflow"}
            onFactorChange={(upscaleFactor) => update({ upscaleFactor })}
            onCreativityChange={(upscaleCreativity) =>
              update({ upscaleCreativity })
            }
          />
        )}
      </div>
      <div className="toolbar-action">{action}</div>
      <Cost
        estimate={estimate}
        credits={estimateCredits}
        // A graph's key is the run location's, named by the run-mode line.
        payer={entryFor(generator, model).route === "workflow" ? null : keyKind}
      />
    </div>
  );
}

/**
 * The run's price under Generate. With the paying key known: dollars, then
 * the paying account's own unit and which key it is ("$0.80 · 80 BFL cr ·
 * BFL key"). Otherwise as before: Comfy credits then their rough dollars for
 * LTX, a dollar estimate for FLUX and the Upscaler.
 */
function Cost({
  estimate,
  credits,
  payer,
}: {
  estimate: number | null;
  credits: number | null;
  payer: KeyKind | null;
}) {
  if (payer && estimate !== null) {
    const price = priceText(estimate, payer, credits, CREDITS_PER_USD);
    return (
      <div className="cost" title={price.detail}>
        <strong>{price.amount}</strong>
        <span>{price.unit.toUpperCase()} / RUN</span>
        <span className="cost__payer">
          {payer === "bfl" ? "BFL KEY" : "COMFY KEY"}
        </span>
      </div>
    );
  }
  return (
    <div className="cost">
      <strong>
        {estimate === null
          ? "—"
          : credits !== null
            ? `${Math.round(credits)} cr`
            : `$${estimate.toFixed(2)}`}
      </strong>
      <span>
        {credits !== null && estimate !== null
          ? `≈ $${estimate.toFixed(2)} / RUN`
          : "EST. / RUN"}
      </span>
    </div>
  );
}

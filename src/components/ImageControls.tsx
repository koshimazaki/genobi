import type { ComposerState } from "../useComposer";
import SelectMenu from "./SelectMenu";
import { Switch } from "./GenerationControls";
import { entryFor, runOptions } from "../../shared/registry";
import { fluxImageControls } from "../../shared/controls";

/** What the Run control's two choices mean, as its title. */
export const RUN_TITLE =
  "Open: Klein's open weights as a Comfy graph, on a local ComfyUI or Comfy Cloud (Comfy key). API: BFL's hosted Klein endpoint (BFL key).";

/**
 * A still's row, drawn from the held entry's controls as the video row is:
 * Run (open graph or API) where the model offers both, the ratios and tiers
 * the entry takes, web grounding where it exists (FLUX 3 Image only), and the
 * camera switch where the entry keeps the camera's framing.
 */
export default function ImageControls({
  state,
  update,
  hasRegions,
}: {
  state: ComposerState;
  update: (p: Partial<ComposerState>) => void;
  hasRegions?: boolean;
}) {
  const entry = entryFor(state.generator, state.model);
  const controls =
    entry.controls.kind === "image" ? entry.controls : fluxImageControls;
  const runs = runOptions(entry);
  return (
    <div className="image-controls">
      {runs && (
        <div className="image-controls__run" title={RUN_TITLE}>
          <SelectMenu
            id="image-run"
            label="Run"
            compact
            value={runs.held}
            options={[
              { value: "open", label: "Open" },
              { value: "api", label: "API" },
            ]}
            onChange={(value) =>
              update({
                model: (value === "api" ? runs.api : runs.open).videoModel,
              })
            }
          />
        </div>
      )}
      <SelectMenu
        id="image-aspect"
        label="Aspect ratio"
        compact
        value={
          state.generator === "edit" && hasRegions
            ? "auto"
            : hasRegions &&
                state.generator === "image" &&
                (!state.imageAspectRatio || state.imageAspectRatio === "auto")
              ? "1:1"
              : (state.imageAspectRatio ?? "auto")
        }
        disabled={state.generator === "edit" && hasRegions}
        options={controls.aspectRatios.map((value) => ({
          value,
          label: value === "auto" ? "Auto" : value,
        }))}
        onChange={(value) =>
          update({
            imageAspectRatio: value as ComposerState["imageAspectRatio"],
          })
        }
      />
      <SelectMenu
        id="image-resolution"
        label="Resolution"
        compact
        value={state.imageResolution ?? "1k"}
        options={controls.resolutions.map((value) => ({
          value,
          label: value === "768sq" ? "768 px" : value.toUpperCase(),
        }))}
        onChange={(value) =>
          update({ imageResolution: value as ComposerState["imageResolution"] })
        }
      />
      {controls.grounding && (
        <div className="instrument-field">
          <span className="instrument-label">Web grounding</span>
          <button
            type="button"
            className="instrument-trigger"
            role="switch"
            aria-checked={state.imageGrounding ?? false}
            aria-label="Web grounding"
            onClick={() => update({ imageGrounding: !state.imageGrounding })}
          >
            {state.imageGrounding ? "On" : "Off"}
          </button>
        </div>
      )}
      {controls.camera && (
        <Switch
          id="camera"
          label="Camera"
          on={state.cameraEnabled}
          onChange={(cameraEnabled) => update({ cameraEnabled })}
        />
      )}
    </div>
  );
}

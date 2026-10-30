import { useState } from "react";
import type { GenerateInput, Source } from "../../shared/types";
import { UPSCALE_PART_MAX_SECONDS } from "../../shared/upscale-parts";
import UpscalePartsDialog from "./UpscalePartsDialog";

/**
 * The offer beside a clip too long for one upscale: the button that opens
 * the split's plan and price. Nothing is sent from here.
 */
export default function UpscaleSplit({
  input,
  source,
  apiKey,
  refresh,
  optional = false,
}: {
  input: GenerateInput;
  source: Source;
  apiKey: string;
  refresh: () => Promise<void>;
  /** SeedVR2 on a local GPU runs the whole clip; parts only spare VRAM. */
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parts = Math.ceil(source.duration / UPSCALE_PART_MAX_SECONDS);
  return (
    <>
      {optional
        ? " · one local run, or if VRAM is short · "
        : " · too long for one upscale · "}
      <button
        type="button"
        className="text-button upscale-split"
        onClick={() => setOpen(true)}
      >
        {optional ? "Upscale in parts" : `Split into ${parts} parts`}
      </button>
      {open && (
        <UpscalePartsDialog
          input={input}
          apiKey={apiKey}
          onClose={() => setOpen(false)}
          onJoined={() => void refresh()}
        />
      )}
    </>
  );
}

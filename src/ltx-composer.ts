import { takesCamera } from "../shared/controls";
import { isLtxModel } from "../shared/camera";
import {
  emptyLight,
  type LightEdits,
  type LightSelection,
} from "../shared/light";
import {
  composedRefusal,
  composesLtx,
  emptySlots,
  fitSegments,
  ltxRecord,
  ltxSegments,
  ltxSlots,
  type LtxPrompt,
  type LtxPromptState,
  type LtxSlots,
  type Segment,
  type SlotId,
} from "../shared/ltx-prompt";
import { entryFor } from "../shared/registry";
import type { AcousticSetting } from "../shared/acoustic";
import type { CameraEdits, CameraSelection } from "../shared/camera";
import type { Generator, Job, VideoModel } from "../shared/types";

/** The composer fields the LTX paragraph reads. */
export interface LtxComposerFields {
  generator: Generator;
  model: VideoModel;
  description: string;
  cameraEnabled: boolean;
  camera: CameraSelection;
  cameraEdits: CameraEdits;
  acoustic: AcousticSetting | null;
  slots: LtxSlots;
  light: LightSelection;
  lightEdits: LightEdits;
}

/**
 * The paragraph's inputs as the request will carry them: the entry's model,
 * the camera only where the entry takes it, and the treatment only on the
 * Acoustic Space entry, as `composerInput` sends them.
 */
export function ltxState(state: LtxComposerFields): LtxPromptState {
  const entry = entryFor(state.generator, state.model);
  const controls = entry.controls;
  return {
    ...state,
    model: entry.videoModel,
    cameraEnabled: takesCamera(controls) && state.cameraEnabled,
    acoustic:
      controls.kind === "video" && controls.acoustic ? state.acoustic : null,
  };
}

/**
 * A composed LTX request's description and record, or null when the request
 * is today's: not LTX video, or no gap and no Light chosen.
 */
export function ltxRequest(
  state: LtxComposerFields,
): { description: string; ltxPrompt: LtxPrompt } | null {
  const input = ltxState(state);
  const ltxPrompt = ltxRecord(input);
  if (!ltxPrompt) return null;
  return { description: fitSegments(ltxSegments(input)).text, ltxPrompt };
}

/** The colour-coded parts of an LTX video's prompt, or undefined for anything else. */
export function ltxPreview(state: LtxComposerFields): Segment[] | undefined {
  if (state.generator !== "video" || !isLtxModel(state.model)) return undefined;
  return ltxSegments(ltxState(state));
}

/**
 * True when a video composition cannot be sent: no text, a cut that would
 * reach the caption, or a composed request the server's own rule
 * (`composedRefusal`) would refuse.
 */
export function ltxBlocked(state: LtxComposerFields): boolean {
  const input = ltxState(state);
  const text =
    state.description.trim() ||
    (isLtxModel(input.model) &&
      ltxSlots.some(({ id }) => state.slots[id].trim()));
  if (!text) return true;
  if (!composesLtx(input)) return false;
  if (fitSegments(ltxSegments(input)).blocked) return true;
  const request = ltxRequest(state)!;
  return (
    composedRefusal(request.description, request.ltxPrompt, input.acoustic) !==
    null
  );
}

/**
 * What a restored run puts back in the gaps: its recorded parts, the main
 * field holding the text typed there rather than the composed paragraph.
 * A run without a record restores as it always has, with the gaps empty.
 */
export function restoredGaps(job: Job) {
  const record = job.ltxPrompt;
  if (!record)
    return {
      description: job.description,
      slots: emptySlots,
      light: emptyLight,
      lightEdits: {},
    };
  const { main, light, lightEdits, ...slots } = record;
  return {
    description: main,
    slots: { ...emptySlots, ...slots },
    light,
    lightEdits,
  };
}

/**
 * The DOM id of a gap's text field, while its tab is open. The voice prompt
 * router (`src/voice/prompt-target.ts`) reads the same ids, so dictation
 * reaches the gap on screen.
 */
export const gapFieldId = (slot: SlotId) => `prompt-${slot}`;

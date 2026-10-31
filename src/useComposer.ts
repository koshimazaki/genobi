import { requestInput } from "./composer-input";
import { type ImageRegion } from "./image-regions";
import { isImage, isKlein } from "../shared/image";
import { useCallback, useReducer, useRef, type RefObject } from "react";
import {
  defaultCamera,
  cameraClauses,
  type CameraSelection,
  type CameraEdits,
  type CameraTermId,
} from "../shared/camera";
import { fitCamera } from "../shared/camera-fit";
import { presets } from "../shared/legacy-camera";
import {
  isVideoSource,
  type GenerateInput,
  type Job,
  type Source,
  type VideoModel,
} from "../shared/types";
import { featuredSource, librarySetupJob } from "./library";
import { useSetupDefaults } from "./useSetupDefaults";
import {
  ACOUSTIC_PAIR,
  entryFor,
  OPEN_DEFAULT,
  OPEN_IMAGE_DEFAULT,
  OPEN_UPSCALE_DEFAULT,
  readyEntry,
} from "../shared/registry";
import { fitControls, takesCamera } from "../shared/controls";
import { defaultAcoustic, type AcousticSetting } from "../shared/acoustic";
import { useVoiceIntentTarget } from "./voice/voice-intent-target";
import { supersedeRestores } from "./settings-store";
import {
  emptyLight,
  type LightEdits,
  type LightSelection,
} from "../shared/light";
import { emptySlots, type LtxSlots } from "../shared/ltx-prompt";
import { ltxRequest, restoredGaps } from "./ltx-composer";
import { restoreMusic } from "./music-composer";
import { restoredRunInputs, type RunInputs } from "./run-inputs";
/** Kept here for its callers; it lives in its own module. */
export { composerBlocked } from "./composer-blocked";
export type ComposerState = Omit<
  GenerateInput,
  "presetId" | "cameraText" | "model" | "acoustic"
> & {
  /** Always known in the composer; absent only on jobs recorded before the switch. */
  model: VideoModel;
  /** The AKUSPACE treatment; set exactly while the Acoustic Space entry is held. */
  acoustic: AcousticSetting | null;
  camera: CameraSelection;
  cameraEdits: CameraEdits;
  sourceId: string;
  upscalePrompt: string;
  /** "Open source only": the menu hides closed entries. Never sent to the server. */
  openOnly: boolean;
  imageRegions: ImageRegion[];
  /** LTX's four gaps; composed into the description for LTX video only. */
  slots: LtxSlots;
  /** LTX's Light picker and its edited sentences. */
  light: LightSelection;
  lightEdits: LightEdits;
};
/**
 * A composer with no run loaded. Only reached when the shipped catalogue has no
 * usable first clip, which `tests/composer.test.ts` fails on rather than letting
 * the studio open on an invented scene.
 */
const emptyComposer: ComposerState = {
  generator: "video",
  model: "flux-3",
  description: "",
  lyrics: "",
  cameraEnabled: true,
  camera: defaultCamera,
  cameraEdits: {},
  draft: false,
  acoustic: null,
  duration: 5,
  aspectRatio: "16:9",
  resolution: "hd",
  sourceId: "",
  upscalePrompt: "",
  upscaleFactor: 2,
  upscaleCreativity: 0,
  openOnly: false,
  imageRegions: [],
  imageReferences: [],
  imageResolution: "1k",
  imageProvider: "auto",
  imageAspectRatio: "auto",
  imageGrounding: false,
  imageSafetyTolerance: 2,
  slots: emptySlots,
  light: emptyLight,
  lightEdits: {},
};
/**
 * The composer state a catalogue clip's recorded run restores, through the same
 * reducer action Recreate uses. One path, so the opening screen cannot describe
 * a run differently from the way Recreate restores it.
 */
function composerFromLibrary(source: Source | undefined): ComposerState {
  const job = source ? librarySetupJob(source) : undefined;
  return job
    ? composerReducer(emptyComposer, { type: "restore", job })
    : emptyComposer;
}
/**
 * What the composer opens on: the run of the clip the main view features. The
 * clip, its scene text, its camera clauses and its generation settings are one
 * run — the one `public/media/gallery.json` records for it — rather than a clip
 * paired with a prompt that made something else.
 */
export const initialComposer: ComposerState =
  composerFromLibrary(featuredSource);
type Action =
  | { type: "update"; patch: Partial<ComposerState> }
  | { type: "restore" | "restore-prompt"; job: Job; inputs?: RunInputs };
/**
 * Open-only means the composer holds an open entry. Switching it on moves a
 * closed selection to LTX-2.5 Fast, a closed still to open Klein, or FLUX
 * Video Upscale to SeedVR2, the open upscaler; reaching
 * a closed run another way — a Recreate, a title click, a gallery Upscale —
 * switches it off, so the toggle never reads On over a run it would not allow.
 */
function keepOpen(state: ComposerState, switchedOn: boolean): ComposerState {
  if (!state.openOnly || entryFor(state.generator, state.model).open)
    return state;
  if (!switchedOn) return { ...state, openOnly: false };
  const fallback = readyEntry(
    isImage(state.generator)
      ? OPEN_IMAGE_DEFAULT
      : state.generator === "upscale"
        ? OPEN_UPSCALE_DEFAULT
        : OPEN_DEFAULT,
  )!;
  return {
    ...state,
    generator: fallback.generator,
    model: fallback.videoModel,
  };
}
/**
 * Acoustic Space is an entry (the AKUSPACE workflow) and a treatment, and the
 * two move together: the entry always holds a treatment and no other entry
 * does. Reaching the entry — the switch, the menu row — without one takes the
 * node's default; choosing a space on LTX-2.5 Fast moves to the entry;
 * choosing None moves back to Fast.
 */
function keepAcoustic(
  state: ComposerState,
  patch: Partial<ComposerState> | null,
): ComposerState {
  const id = entryFor(state.generator, state.model).id;
  const fast = readyEntry(ACOUSTIC_PAIR.off)!.videoModel;
  const acoustic = readyEntry(ACOUSTIC_PAIR.on)!.videoModel;
  if (id === ACOUSTIC_PAIR.on) {
    if (patch && "acoustic" in patch && !patch.acoustic)
      return { ...state, model: fast, acoustic: null };
    return state.acoustic ? state : { ...state, acoustic: defaultAcoustic };
  }
  if (id === ACOUSTIC_PAIR.off && patch?.acoustic)
    return { ...state, model: acoustic };
  return state;
}
/**
 * Whatever moved the composer — a menu row, the family switch, Open only, a
 * Recreate — the held entry's controls decide the values it keeps. A value the
 * entry cannot take moves once to one it can (an LTX 7s becomes 6s, 21:9
 * becomes 16:9, draft goes off, a treatment goes), so the row on screen and
 * the request agree.
 */
export function composerReducer(
  state: ComposerState,
  action: Action,
): ComposerState {
  const patch = action.type === "update" ? action.patch : null;
  const next = keepOpen(
    keepAcoustic(
      action.type === "restore"
        ? {
            ...reduce(state, action),
            ...restoredRunInputs(action.job, action.inputs),
          }
        : reduce(state, action),
      patch,
    ),
    patch?.openOnly === true,
  );
  // Only a generator that writes a camera fits it (a still, its framing only);
  // Upscale and other camera-less entries keep the selection parked.
  const controls = entryFor(next.generator, next.model).controls;
  const camera = takesCamera(controls)
    ? fitCamera(next.camera, next.model, isImage(next.generator))
    : next.camera;
  const fitted = camera === next.camera ? next : { ...next, camera };
  return fitControls(controls, fitted);
}
function reduce(state: ComposerState, action: Action): ComposerState {
  // Camera dialogue edits arrive as an "update" patch; see CameraDialog onApply.
  if (action.type === "update")
    return {
      ...state,
      ...(action.patch.generator && action.patch.generator !== state.generator
        ? { imageRegions: [] }
        : {}),
      ...(action.patch.model && action.patch.model !== state.model
        ? { deploy: undefined }
        : {}),
      ...action.patch,
    };
  const job = action.job;
  if (job.generator === "audio")
    return restoreMusic(state, job, action.type === "restore");
  if (isImage(job.generator))
    return {
      ...state,
      generator: job.generator,
      // A Klein still restores as Klein, with the framing it was given: its
      // own wording for each selected term, so a phrase from another run for
      // the same term is not carried in, as the video path below does.
      model: isKlein(job.model) ? job.model! : "flux-3",
      description: job.description,
      cameraEnabled: job.cameraEnabled === true,
      ...(job.camera
        ? {
            camera: job.camera,
            cameraEdits: {
              ...state.cameraEdits,
              ...Object.fromEntries(
                cameraClauses(job.camera, job.cameraEdits, job.model).map(
                  ({ term, text }) => [term.id, text],
                ),
              ),
            },
          }
        : {}),
      acoustic: null,
      slots: emptySlots,
      light: emptyLight,
      lightEdits: {},
      imageRegions: [],
      imageReferences: [],
      imageProvider: action.type === "restore" ? (job.imageProvider ?? "auto") : state.imageProvider,
      imageResolution:
        action.type === "restore"
          ? (job.imageResolution ?? "1k")
          : state.imageResolution,
      imageAspectRatio:
        action.type === "restore"
          ? (job.imageAspectRatio ?? "auto")
          : state.imageAspectRatio,
      imageGrounding:
        action.type === "restore"
          ? (job.imageGrounding ?? false)
          : state.imageGrounding,
      imageSafetyTolerance: job.imageSafetyTolerance ?? 2,
    };
  if (action.type === "restore-prompt" && job.generator === "upscale")
    return {
      ...state,
      generator: job.generator,
      upscalePrompt: job.upscalePrompt ?? "",
    };
  let camera = job.camera;
  let edits: CameraEdits = job.camera
    ? Object.fromEntries(
        cameraClauses(job.camera, job.cameraEdits, job.model).map(
          ({ term, text }) => [term.id, text],
        ),
      )
    : {};
  if (!camera) {
    // Translate old IDs once, preserving the exact historical prompt (including blank edits).
    const legacy = presets.find((p) => p.id === job.presetId);
    const id: CameraTermId =
      job.presetId === "low"
        ? "low-angle"
        : job.presetId === "top"
          ? "birds-eye"
          : job.presetId === "crane_up"
            ? "crane"
            : job.presetId?.startsWith("dolly")
              ? "dolly-in"
              : "orbit";
    camera = {
      "shot-sizes": null,
      angles: id === "low-angle" || id === "birds-eye" ? id : null,
      movements: id === "low-angle" || id === "birds-eye" ? null : id,
    } as CameraSelection;
    edits = { [id]: job.cameraText ?? legacy?.clause ?? "" };
  }
  const prompt = {
    // The gaps come back as gaps; a run without them, exactly as before.
    ...restoredGaps(job),
    cameraEnabled: job.cameraEnabled,
    camera,
    cameraEdits: { ...state.cameraEdits, ...edits },
  };
  if (action.type === "restore-prompt")
    return {
      ...state,
      generator: job.generator,
      model: job.model ?? "flux-3",
      ...prompt,
      // The treatment is part of the prompt the run received.
      acoustic: job.acoustic ?? null,
    };
  return {
    generator: job.generator,
    model: job.model ?? "flux-3",
    ...prompt,
    draft: job.draft,
    acoustic: job.acoustic ?? null,
    duration: job.duration,
    aspectRatio: job.aspectRatio ?? "16:9",
    resolution: job.resolution,
    sourceId: job.sourceId ?? "",
    upscalePrompt: job.upscalePrompt ?? "",
    upscaleFactor: job.upscaleFactor,
    upscaleCreativity: job.upscaleCreativity ?? 0,
    openOnly: state.openOnly,
    imageRegions: [],
    imageReferences: [],
  };
}
export function composerInput(composer: ComposerState): GenerateInput {
  const {
    slots: _slots,
    light: _light,
    lightEdits: _lightEdits,
    ...rest
  } = composer;
  const input = requestInput(rest);
  // LTX with a gap or Light: the paragraph in the guide's order, recorded.
  const ltx = input.generator === "video" ? ltxRequest(composer) : null;
  return ltx ? { ...input, ...ltx } : input;
}

/** An explicit source wins; otherwise continue with the newest saved result. */
export function upscaleSource(
  selectedId: string,
  jobs: Job[],
  sources: Source[],
): Source | undefined {
  if (selectedId)
    return sources.find(
      (source) => source.id === selectedId && isVideoSource(source),
    );
  const generated = new Map(
    sources
      .filter(
        (source) => source.origin === "generated" && isVideoSource(source),
      )
      .map((source) => [source.id, source]),
  );
  const latest = jobs
    .filter(
      (job) =>
        job.status === "Ready" &&
        job.mediaAvailable !== false &&
        generated.has(job.id),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return latest ? generated.get(latest.id) : undefined;
}

/**
 * The one write path for an edit the visitor made: mark it, then dispatch it.
 * Both `set` and the camera dialogue's `Done` go through here, so a control
 * cannot move the composer without telling the restore effect in `src/App.tsx`
 * that the state is theirs to keep — an edit that dispatched on its own was
 * silently restorable.
 */
export function markEdit(
  dispatch: (action: Action) => void,
  edited: RefObject<boolean>,
  patch: Partial<ComposerState>,
): void {
  edited.current = true;
  // A newer choice of model or entry supersedes a pending Recreate restore.
  if (SETUP_KEYS.some((key) => key in patch)) supersedeRestores();
  dispatch({ type: "update", patch });
}
/** The composer fields that choose the entry, and so its workflow. */
const SETUP_KEYS: (keyof ComposerState)[] = [
  "generator",
  "model",
  "acoustic",
  "openOnly",
];

export function useComposer() {
  const [state, dispatch] = useReducer(composerReducer, initialComposer);
  /**
   * True once the visitor has changed a control. The composer then holds their
   * edit, so an arriving or newly selected run is not restored over it; see the
   * restore effect in `src/App.tsx`.
   */
  const edited = useRef(false);
  const update = (patch: Partial<ComposerState>) =>
    markEdit(dispatch, edited, patch);
  const set = <K extends keyof ComposerState>(
    key: K,
    value: ComposerState[K],
  ) => update({ [key]: value } as Pick<ComposerState, K>);
  // Setup's Open only default is not an edit: a run arriving still restores.
  useSetupDefaults(state, (patch) => dispatch({ type: "update", patch }));
  // A spoken request ("an image with FLUX of a penguin") lands here (#23).
  useVoiceIntentTarget(state, update);
  // A run or clip restored into the composer is a newer setup choice: a
  // pending Recreate restore of another run's settings must not land over it.
  const restore = useCallback((action: Action) => {
    if (action.type !== "update") supersedeRestores();
    dispatch(action);
  }, []);
  return { state, set, update, dispatch: restore, edited };
}

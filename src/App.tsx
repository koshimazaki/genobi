import { submitWithDeploymentApproval } from "./deployment-approval";
import { useLayoutTakeComposer } from "./useLayoutTakeComposer";
import { estimateSeedvr2Usd, isSeedvr2 } from "../shared/comfy/seedvr2";
import ComposerWorkspace from "./components/ComposerWorkspace";
import { useScrollsBridge } from "./scrolls/bridge";
import { StudioPanel, useShell } from "./studio/ShellContext";
import { useEffect, useRef, useState } from "react";
import { useWorldBuilder } from "./world-builder/useWorldBuilder";
import { readReference } from "./image-files";
import { isH3, h3EstimateCredits } from "../shared/h3";
import { h3RouterCredits, isH3Router } from "../shared/comfy/h3-router";
import { estimateImageUsd, isImage } from "../shared/image";
import { MUSIC_ESTIMATE_CREDITS } from "../shared/music";
import { useImageReferences } from "./useImageReferences";
import ImageStage from "./components/ImageStage";
import GenerateAction, { imageProviderFor } from "./components/GenerateAction";
import type { Job, Source } from "../shared/types";
import { usePageKey } from "./usePageKey";
import { useServerKey } from "./useServerKey";
import {
  useComposer,
  composerInput,
  composerBlocked,
  upscaleSource,
} from "./useComposer";
import FeaturedVideo from "./components/FeaturedVideo";
import {
  composePrompt,
  estimateVideoUsd,
  estimateUpscaleUsd,
} from "../shared/presets";
import { settledRevision, useJobs } from "./useJobs";
import { useImageEdit } from "./useImageEdit";
import { useComposerRecreate } from "./useComposerRecreate";
import { librarySetupJob } from "./library";
import CameraDialog from "./components/CameraDialog";
import AcousticDialog from "./components/AcousticDialog";
import Gallery from "./components/Gallery";
import KeyDialog from "./components/KeyDialog";
import ComposerAlerts from "./components/ComposerAlerts";
import { useReview } from "./useReview";
import { smoothScroll } from "./scroll";
import ComposerToolbar from "./components/ComposerToolbar";
import ComposerActions from "./components/ComposerActions";
import ModeBadge from "./components/ModeBadge";
import Topbar from "./components/Topbar";
import StudioFoot from "./components/StudioFoot";
import { useHiddenJobs } from "./useHiddenJobs";
import { heroMedia, activeRun } from "./hero";
import { generatorFoot } from "./generators";
import { CREDITS_PER_USD, estimateVideoCredits } from "../shared/comfy/ltx";
import { isLtxModel } from "../shared/camera";
import { ltxPreview } from "./ltx-composer";
import { useAgentSettings } from "./agent/studio-context";
import { useJobActivity } from "./busy";
import { runsKeyless } from "./local-menu";
import { runPayer } from "./run-mode";
export default function App() {
  const shell = useShell();
  const { state, set, update, dispatch, edited } = useComposer();
  const {
    generator,
    camera,
    cameraEdits,
    draft,
    model,
    duration,
    resolution,
    upscalePrompt,
    upscaleFactor,
    upscaleCreativity,
  } = state;
  const [showCamera, setShowCamera] = useState(false);
  const [imagePreviewRevision, setImagePreviewRevision] = useState(0);
  const [showAcoustic, setShowAcoustic] = useState(false);
  /**
   * The catalogue clip a Recreate or a title click loaded, while the composer
   * holds its run. `heroMedia` gives it the main view until one of the visitor's
   * own runs becomes what the composer holds, so the scene on screen is always
   * the one whose prompt and camera direction are being edited below it.
   *
   * The displayed run is derived from the composer, with no second flag to sync.
   */
  const [activeCatalogueId, setActiveCatalogueId] = useState<string | null>(
    null,
  );
  const [key, setKey] = usePageKey();
  const [showKey, setShowKey] = useState(false),
    [keyVerified, setKeyVerified] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [uploading, setUploading] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const {
    jobs,
    sources,
    error,
    setError,
    needsKey,
    refresh,
    generate,
    track,
    selectJob,
    selectedId,
  } = useJobs(key);
  useJobActivity(jobs);
  useScrollsBridge(key, generate, jobs, update);
  useLayoutTakeComposer(update, () => setActiveCatalogueId(null));
  const { hasServerKey, slots, connection, keysChanged } =
    useServerKey(setError);
  const { hiddenIds, hide, restoreAll } = useHiddenJobs();
  const visibleJobs = jobs.filter((job) => !hiddenIds.has(job.id));
  /**
   * The run the screen holds: the one the visitor chose, even when they have
   * hidden it from the gallery, otherwise the newest visible run. Resolving the
   * choice against every run rather than the visible ones is what keeps the
   * hero and the composer on one run when the selected card is hidden — the
   * composer keeps that run, so the main view has to keep showing it.
   */
  const selectedRun = activeRun(selectedId, jobs, visibleJobs);
  const samples = sources.filter((source) => source.origin === "sample");
  const source = upscaleSource(state.sourceId, jobs, sources);
  useAgentSettings(state, source?.id); // "these settings", as Generate sends (#23)
  const hero = heroMedia({
    generator,
    catalogueId: activeCatalogueId,
    upscale: source,
    selected: selectedRun,
    runs: visibleJobs,
    samples,
  });
  const review = useReview({
    key,
    hasServerKey,
    connection,
    heroJob: hero.job,
    sources,
    selectedId,
    selectJob,
    trackJob: track,
    catalogueId: activeCatalogueId,
    onConnectKey: () => setShowKey(true),
    composer: state,
    // A chain's review sits over its own take, in the video composer.
    onShowVideo: (reveal) => {
      if (reveal && shell && !shell.visible.includes("composer"))
        shell.select("camera");
      setActiveCatalogueId(null);
      update({ generator: "video" });
    },
  });
  const hiddenCount = jobs.filter((job) => hiddenIds.has(job.id)).length;
  const restoredRun = useRef<string | null>(null);
  useEffect(() => {
    // Selecting a run of your own ends a catalogue clip's turn in the main view.
    if (selectedId) setActiveCatalogueId(null);
  }, [selectedId]);
  useEffect(() => {
    // The composer opens on the run the main view shows — the linked run, or the
    // newest visible one — so the two cannot open on different runs. It stops
    // once the visitor changes a control here: that edit is theirs to keep.
    if (activeCatalogueId || edited.current || !selectedRun) return;
    if (restoredRun.current === selectedRun.id) return;
    restoredRun.current = selectedRun.id;
    dispatch({ type: "restore", job: selectedRun });
  }, [activeCatalogueId, edited, selectedRun, dispatch]);
  const sourceId = isH3(model) ? state.sourceId : (source?.id ?? "");
  const seedvr2 = isSeedvr2(model);
  const upscaleMode =
    upscaleCreativity === 0 || seedvr2 ? "Precise" : "Creative";
  const ltx = isLtxModel(model);
  const runResolution = resolution;
  const estimateCredits =
    generator !== "video"
      ? null
      : ltx
        ? estimateVideoCredits(model, duration, runResolution)
        : isH3Router(model)
          ? h3RouterCredits(duration, runResolution)
          : null;
  const payer = runPayer(key, slots, generator, model, imageProviderFor(state));
  const estimate = isImage(generator)
    ? estimateImageUsd(state)
    : generator === "audio"
      ? MUSIC_ESTIMATE_CREDITS / CREDITS_PER_USD
      : generator === "video"
        ? estimateCredits !== null
          ? estimateCredits / CREDITS_PER_USD
          : isH3(model)
            ? h3EstimateCredits(model) / CREDITS_PER_USD
            : estimateVideoUsd(draft, duration, runResolution)
        : source
          ? seedvr2
            ? estimateSeedvr2Usd(source, upscaleFactor)
            : estimateUpscaleUsd(source, upscaleFactor, upscaleCreativity)
          : null;
  const total = jobs.reduce(
    (sum, job) => sum + (job.costActualUsd ?? job.costEstimateUsd),
    0,
  );
  const composed =
    generator !== "upscale"
      ? composePrompt(composerInput(state))
      : seedvr2
        ? `SeedVR2 ${upscaleFactor}× upscale, open weights. Restore the clip as it is.`
        : `${upscaleMode} ${upscaleFactor}× upscale. ${upscaleCreativity === 0 ? "Preserve original detail." : "Reimagine finer detail."}${upscalePrompt.trim() ? `\n\n${upscalePrompt.trim()}` : ""}`;
  function saveKey(value: string) {
    if (value !== key) setKeyVerified(false);
    setKey(value);
  }

  const images = useImageReferences(state, update);
  const { recreate, pending: recreating } = useComposerRecreate(
    state,
    dispatch,
    setError,
  );
  const [layoutRevision, setLayoutRevision] = useState(0);

  const worldBuilder = useWorldBuilder(async (blob, recipe) => {
    const reference = await readReference(
      new File([blob], "world-first-frame.png", { type: blob.type }),
    );
    update({
      generator: "edit",
      model: "flux-3",
      description: recipe.prompt,
      imageReferences: [reference],
      imageRegions: [],
      imageAspectRatio: "auto",
    });
    setActiveCatalogueId(null);
    setError("");
  }, setError);

  const editImage = useImageEdit(
    update,
    (job) => {
      if (shell && !shell.visible.includes("composer")) shell.select("camera");
      setActiveCatalogueId(null);
      selectJob(job.id);
    },
    setError,
    setUploading,
  );
  function chooseUpscale(id: string) {
    if (shell && !shell.visible.includes("composer")) shell.select("camera");
    set("sourceId", id);
    set("generator", "upscale");
    composerRef.current?.scrollIntoView(smoothScroll("center"));
  }
  async function submit() {
    if (
      ((!key && !hasServerKey) || (isImage(generator) && !payer)) &&
      !runsKeyless(generator, model)
    ) {
      setShowKey(true);
      return;
    }
    setSubmitting(true);
    try {
      const input = {
        ...composerInput({ ...state, sourceId }),
        description:
          generator === "upscale"
            ? source?.label || "Upscale"
            : composerInput(state).description,
      };
      await submitWithDeploymentApproval(input, key, (input, approval) =>
        generate(input, approval, state),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The generation could not start.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  function retry(job: Job) {
    setImagePreviewRevision((value) => value + 1);
    if (shell && !shell.visible.includes("composer")) shell.select("camera");
    setActiveCatalogueId(null);
    restoredRun.current = job.id;
    edited.current = true;
    void recreate(job);
    selectJob(job.id);
  }
  function applyPrompt(job: Job) {
    setImagePreviewRevision((value) => value + 1);
    if (shell && !shell.visible.includes("composer")) shell.select("camera");
    // This explicit choice must not trigger the full reload/legacy-link restore.
    setActiveCatalogueId(null);
    restoredRun.current = job.id;
    dispatch({ type: "restore-prompt", job });
    if (isImage(job.generator) && job.imageReferenceCount)
      setError("Reattach the reference images for this saved prompt.");
    selectJob(job.id);
  }
  /**
   * A library clip restores its recorded run into the composer and takes over
   * the main view, so the clip and the prompt describing it are the same run.
   * It is still never selected as a job: its id names a catalogue entry, so
   * polling or linking it would look for a session job that does not exist.
   */
  function applyLibrarySetup(source: Source, full: boolean) {
    if (shell && !shell.visible.includes("composer")) shell.select("camera");
    const job = librarySetupJob(source);
    if (!job) return;
    setActiveCatalogueId(source.id);
    dispatch({ type: full ? "restore" : "restore-prompt", job });
    composerRef.current?.scrollIntoView(smoothScroll("center"));
  }
  return (
    <>
      <StudioPanel id="header">
        <Topbar
          apiKey={key}
          hasServerKey={hasServerKey}
          slots={slots}
          connection={connection}
          keyVerified={keyVerified}
          onVerified={setKeyVerified}
          revision={settledRevision(jobs)}
          onOpenKey={() => setShowKey(true)}
          onWorldBuilder={
            shell ? () => shell.select("world") : worldBuilder.open
          }
        />
      </StudioPanel>
      {showCamera && (
        <CameraDialog
          model={model}
          still={isImage(generator)}
          selected={camera}
          edits={cameraEdits}
          light={state.light}
          lightEdits={state.lightEdits}
          onClose={() => setShowCamera(false)}
          onApply={(choice) => {
            // Through the hook's edit path, so the camera dialogue marks the
            // composer edited like every other control: a run arriving mid-
            // choice must not be restored over the visitor's camera work.
            update({ ...choice, cameraEnabled: true });
            setShowCamera(false);
          }}
        />
      )}
      {showAcoustic && (
        <AcousticDialog
          selected={state.acoustic}
          onClose={() => setShowAcoustic(false)}
          onApply={(acoustic) => {
            // A space moves LTX-2.5 Fast to the AKUSPACE workflow and None
            // moves back; the reducer keeps the entry and the space together.
            update({ acoustic });
            setShowAcoustic(false);
          }}
        />
      )}
      <main>
        <StudioPanel id="preview">
          {isImage(generator) ? (
            <ImageStage
              state={state}
              update={update}
              images={images}
              result={hero.job}
              previewRevision={imagePreviewRevision}
              layoutRevision={layoutRevision}
              onRetry={retry}
            />
          ) : (
            <FeaturedVideo
              job={hero.job}
              source={hero.source}
              onRetry={retry}
              review={generator === "video" ? review.review : null}
            />
          )}
        </StudioPanel>
        <StudioPanel id="composer">
          <div className="studio" ref={composerRef}>
            <section
              className="composer"
              aria-label={
                isImage(generator)
                  ? "Image composer"
                  : generator === "audio"
                    ? "Music composer"
                    : "Video composer"
              }
            >
              <div className="composer-top">
                <ModeBadge generator={generator} model={model} />
                <ComposerActions
                  generator={generator}
                  model={model}
                  onOpenCamera={() => setShowCamera(true)}
                  onOpenAcoustic={() => setShowAcoustic(true)}
                  onOpenBoxes={() => {
                    if (shell && !shell.visible.includes("preview"))
                      shell.select("camera");
                    setLayoutRevision((value) => value + 1);
                  }}
                />
              </div>
              <ComposerWorkspace
                state={state}
                update={update}
                images={images}
                apiKey={key}
                sources={sources}
                sourceId={sourceId}
                refresh={refresh}
                onError={setError}
                onBusy={setUploading}
                onOpenCamera={() => setShowCamera(true)}
                onOpenAcoustic={() => setShowAcoustic(true)}
              />
              <ComposerToolbar
                state={state}
                update={update}
                estimate={estimate}
                estimateCredits={estimateCredits}
                keyKind={payer}
                action={
                  <GenerateAction
                    state={state}
                    jobs={jobs}
                    submitting={submitting}
                    hasKey={Boolean(key)}
                    recreating={recreating}
                    disabled={
                      uploading ||
                      images.loading ||
                      composerBlocked(state, sourceId, composed)
                    }
                    onSubmit={() => void submit()}
                    onResume={() => setShowKey(true)}
                    onUpdate={update}
                  />
                }
              />
            </section>
            <StudioFoot
              generator={generator}
              foot={generatorFoot(generator, upscaleMode, model)}
              total={total}
              composed={composed}
              parts={ltxPreview(state)}
              onError={setError}
            />
            <ComposerAlerts
              error={error}
              onDismiss={() => setError("")}
              needsKey={needsKey}
              onConnectKey={() => setShowKey(true)}
            />
          </div>
        </StudioPanel>
        <StudioPanel id="gallery">
          <Gallery
            jobs={visibleJobs}
            sources={sources}
            generator={generator}
            model={model}
            chains={review.cards}
            onReviewChain={review.openChain}
            onUpscale={chooseUpscale}
            onEditImage={(job) => void editImage(job)}
            onRetry={retry}
            onSelect={(id) => {
              const job = jobs.find((item) => item.id === id);
              if (job) applyPrompt(job);
            }}
            onLibrarySetup={applyLibrarySetup}
            onHide={hide}
            hiddenCount={hiddenCount}
            onRestoreHidden={restoreAll}
          />
        </StudioPanel>
      </main>
      {showKey && (
        <KeyDialog
          value={key}
          onSave={saveKey}
          onClose={() => setShowKey(false)}
          serverKey={hasServerKey}
          onServerKey={keysChanged}
          needsKey={needsKey}
        />
      )}
    </>
  );
}

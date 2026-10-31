import { liveSession } from "./live-session";
import { SCENE_CAPABILITIES } from "./capabilities";
import { useScenePlayback } from "./useScenePlayback";
import { usePlaybackState } from "./usePlaybackState";
import { rewindUnlessPlaying } from "./scene-playback";
import { useEffect, useRef, useState } from "react";
import { createWorld, type WorldRuntime } from "./runtime";
import {
  presetRecipe,
  validateRecipe,
  parameterSchema,
  type Recipe,
  type Shape,
} from "./recipe";
import { exportTake, png } from "./export-take";
import { withAudioCompanion } from "./take-audio";
import { validSurface } from "./scene-contract";
import { decodeAudio, type AudioTrack } from "./audio";
import { MOVE_SECONDS, reconcileDuration } from "./take-duration";
import { audioLabel, type AudioSource } from "./audio-history";
import { hostMessages } from "./host-messages";
import { useAudioHistory } from "./useAudioHistory";
import { assertWalkEdit } from "./walk-edits";
import { useTakeChannel } from "./take-channel";
import type { RecipeGuard, SceneAdapter } from "./scene-adapter";
import { createRecipeRevision } from "./recipe-revision";
import { withAddedSceneObject, sceneFrameAfterEdit } from "./scene-editing";
export type { SceneAdapter } from "./scene-adapter";
declare global {
  interface Window {
    directorScene?: SceneAdapter;
  }
}
import { errorText, host, runWork, send } from "./session-io";
import { sessionHandoffs } from "./session-handoff";
import { useExampleTrack } from "./example-track";
export { download, host } from "./session-io";

export function useBuilderSession() {
  const canvas = useRef<HTMLCanvasElement>(null),
    runtime = useRef<WorldRuntime | null>(null),
    current = useRef<Recipe>(presetRecipe("Playground")),
    track = useRef<AudioTrack | null>(null),
    controller = useRef<AbortController | null>(null),
    audioElement = useRef<HTMLAudioElement>(null),
    history = useAudioHistory(),
    addRecent = useRef(history.add),
    loader = useRef<
      (blob: Blob, source: AudioSource, label?: string) => Promise<void>
    >(() => Promise.reject(new Error("The scene is still starting.")));
  const [recipe, setRecipe] = useState(current.current),
    [frame, setFrame] = useState(0),
    [busy, setBusy] = useState(false),
    [capturing, setCapturing] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Ready to prepare a set."),
    [take, setTake, onTake] = useTakeChannel(),
    [audioURL, setAudioURL] = useState(""),
    [audioName, setAudioName] = useState(""),
    [mediaName, setMediaName] = useState(""),
    [loop, setLoop] = useState(false);
  const api = useRef<SceneAdapter | null>(null),
    previewQueue = useRef(Promise.resolve()),
    settling = useRef<() => boolean>(() => false);
  const playback = usePlaybackState(
    runtime,
    audioElement,
    previewQueue,
    () => !controller.current && !settling.current(),
  );
  const { playing, playingRef, setPlaying, stopping, settled } = playback;
  const [json, setJson] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let world: WorldRuntime;
    try {
      world = createWorld(canvas.current!, (patch) => {
        void api.current
          ?.configure({ ...current.current, ...patch })
          .catch((e) => setError(errorText(e)));
      });
    } catch (error) {
      setError(`WebGL could not start: ${errorText(error)}`);
      return;
    }
    runtime.current = world;
    world.configure(current.current);
    void world
      .renderFrame(0)
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    let alive = true;
    let loading = false;
    const revision = createRecipeRevision();
    const idle = (allowWalk = false, allowPlay = false) => {
      if (
        loading ||
        controller.current ||
        (!allowPlay && playingRef.current) ||
        (!allowWalk && world.editor?.mode === "walk")
      )
        throw new Error("Stop preview or wait for the current operation.");
    };
    async function applyRecipe(
      next: Recipe,
      guard?: RecipeGuard,
      commitAudio?: () => void,
    ) {
      await previewQueue.current.catch(() => {});
      if (!alive) throw new Error("Scene was closed.");
      revision.assert(guard);
      const commitCharacter = await world.prepareCharacter(next);
      if (!alive) throw new Error("Scene was closed.");
      revision.assert(guard);
      commitCharacter();
      if (
        JSON.stringify(next.envelope) !==
        JSON.stringify(current.current.envelope)
      ) {
        track.current = null;
        setAudioURL("");
        setAudioName("");
      }
      const editFrame =
        next.motion && world.editor?.mode === "edit"
          ? sceneFrameAfterEdit(current.current, next, world.frame)
          : 0;
      current.current = next;
      revision.advance();
      commitAudio?.();
      world.configure(next);
      setRecipe(next);
      setTake(null);
      setStatus("Set updated. Capture a new take when ready.");
      await rewindUnlessPlaying(
        playingRef.current,
        setFrame,
        (n) => world.renderFrame(n),
        editFrame,
      ).catch((error) => setError(errorText(error)));
    }
    const live = liveSession(
      canvas.current!,
      world,
      {
        getRecipe: () => structuredClone(current.current),
        configure: (input) => adapter.configure(input),
      },
      (take) => {
        setTake(take);
        setStatus("Live clip ready. Open Capture to download.");
      },
      setError,
      () => idle(true),
    );
    /** Frame zero as a PNG, under the same capture guard as a take. */
    async function still(draw: (frame: number) => Promise<HTMLCanvasElement>) {
      idle();
      if (world.editor?.mode !== "shot")
        throw new Error("Return to Shot mode before capture.");
      loading = true;
      setBusy(true);
      try {
        await previewQueue.current.catch(() => {});
        world.assertMedia();
        world.beginCapture();
        const canvas = await draw(0);
        setFrame(0);
        return await png(canvas);
      } finally {
        loading = false;
        if (alive) setBusy(false);
        world.endCapture();
        if (alive) await world.renderFrame(0);
      }
    }
    const adapter: SceneAdapter = {
      live,
      describe: () => ({
        version: 1,
        renderers: ["stage", "neuro", "playground"],
        parameters: parameterSchema,
        seconds: MOVE_SECONDS,
        capabilities: [...SCENE_CAPABILITIES],
      }),
      getRecipe: () => structuredClone(current.current),
      getRecipeRevision: revision.read,
      async configure(input, guard) {
        idle(true, true);
        revision.assert(guard);
        const guarded = guard?.expectedRevision !== undefined;
        if (guarded && world.editor?.dragging)
          throw new Error(
            "Finish the transform drag before applying an agent recipe.",
          );
        let next = validateRecipe(reconcileDuration(current.current, input));
        if (world.editor?.mode === "walk")
          assertWalkEdit(current.current, next);
        loading = true;
        const releaseEdits = guarded ? world.editor?.holdEdits() : undefined;
        try {
          const sound = guard?.sound;
          const decoded = sound ? await decodeAudio(sound.blob) : undefined;
          if (decoded)
            next = validateRecipe({
              ...next,
              envelope: decoded.envelope,
              bandEnvelopes: decoded.bands,
            });
          await applyRecipe(next, guard, () => {
            if (!decoded || !sound) return;
            track.current = decoded;
            setAudioURL(URL.createObjectURL(sound.blob));
            setAudioName(sound.label);
          });
          if (sound)
            void addRecent
              .current(sound.blob, "take", sound.label)
              .catch(() => {});
          return structuredClone(next);
        } finally {
          loading = false;
          releaseEdits?.();
        }
      },
      snapshot: () => still((n) => world.renderFrame(n)),
      snapshotDepth: () => still((n) => world.renderDepthFrame(n)),
      async render(n) {
        if (!Number.isInteger(n) || n < 0 || n >= current.current.frames)
          throw new Error("Frame is outside the take.");
        if (controller.current || loading) throw new Error("Scene is busy.");
        previewQueue.current = previewQueue.current
          .catch(() => {})
          .then(async () => {
            if (alive) {
              await world.renderFrame(n);
              setFrame(n);
            }
          });
        await previewQueue.current;
      },
      async capture(options) {
        idle(true);
        if (live.status().recording)
          throw new Error("Stop live recording first.");
        const editor = world.editor;
        if (editor && editor.mode !== "shot") {
          // Walk or Build: the viewport becomes the shot camera; the take replays it with the recipe's move, from Shot.
          const next = validateRecipe({
            ...current.current,
            ...editor.freeze(),
            cameraShot: "custom",
          });
          loading = true;
          try {
            await applyRecipe(next);
          } finally {
            loading = false;
          }
        }
        world.assertMedia();
        const abort = new AbortController();
        controller.current = abort;
        setCapturing(true);
        setBusy(true);
        setError("");
        setProgress(0);
        world.beginCapture();
        try {
          await previewQueue.current;
          const result = await exportTake(
            current.current,
            world,
            abort.signal,
            setProgress,
            options?.name,
          );
          if (track.current)
            await withAudioCompanion(
              result,
              track.current,
              current.current.frames,
            );
          abort.signal.throwIfAborted();
          if (alive) {
            setTake(result);
            setStatus(
              "Capture ready. Download the video, first frame and recipe receipt.",
            );
          }
          return result;
        } finally {
          controller.current = null;
          world.endCapture();
          if (alive) {
            setCapturing(false);
            setBusy(false);
            setFrame(0);
          }
        }
      },
      async setScreen(blob) {
        await adapter.setSurface("screen/all", blob);
      },
      async setSurface(target, blob) {
        idle();
        if (!validSurface(target, current.current))
          throw new Error("Choose a valid surface.");
        const textures = {
          ...current.current.textures,
          [target]: {
            name:
              blob instanceof File ? blob.name.slice(0, 120) : "Attached media",
            type: blob.type.startsWith("image/")
              ? ("image" as const)
              : ("video" as const),
          },
        };
        const next = validateRecipe({ ...current.current, textures });
        loading = true;
        setBusy(true);
        try {
          await previewQueue.current.catch(() => {});
          await world.setMedia(blob, target);
          await applyRecipe(next);
          setMediaName("Texture loaded");
        } finally {
          loading = false;
          if (alive) setBusy(false);
        }
      },
      async clearSurface(target) {
        idle();
        const textures = { ...current.current.textures };
        delete textures[target];
        loading = true;
        try {
          world.clearMedia(target);
          await applyRecipe(validateRecipe({ ...current.current, textures }));
        } finally {
          loading = false;
        }
      },
      setAudio: (blob) => loadAudio(blob, "agent"),
      cancel() {
        controller.current?.abort(new Error("Capture cancelled."));
      },
    };
    /** Sound is live in every mode: a track loads in Shot, Build or Walk. */
    async function loadAudio(blob: Blob, source: AudioSource, label?: string) {
      idle(true);
      loading = true;
      setBusy(true);
      try {
        const decoded = await decodeAudio(blob);
        await applyRecipe(
          validateRecipe({
            ...current.current,
            envelope: decoded.envelope,
            bandEnvelopes: decoded.bands,
          }),
        );
        if (alive) {
          track.current = decoded;
          setAudioURL(URL.createObjectURL(blob));
          setAudioName((await addRecent.current(blob, source, label)).label);
        }
      } finally {
        loading = false;
        if (alive) setBusy(false);
      }
    }
    loader.current = loadAudio;
    settling.current = () => loading;
    api.current = adapter;
    window.directorScene = adapter;
    const listener = hostMessages({
      host,
      adapter,
      loadAudio,
      rememberAudio: (blob, source, label) =>
        addRecent.current(blob, source, label && audioLabel(label, source)),
      fail: (e) => setError(errorText(e)),
    });
    window.addEventListener("message", listener);
    send({ type: "director:ready" });
    return () => {
      alive = false;
      adapter.cancel();
      window.removeEventListener("message", listener);
      if (window.directorScene === adapter) delete window.directorScene;
      api.current = null;
      runtime.current = null;
      live.dispose();
      world.dispose();
    };
  }, [playingRef, setTake]);
  useEffect(
    () => () => {
      if (audioURL) URL.revokeObjectURL(audioURL);
    },
    [audioURL],
  );
  useScenePlayback({
    playing,
    revision: playback.revision,
    soundPreview: playback.soundPreview,
    // A seamless-loop recipe always previews looping, so the seam is seen.
    loop: loop || recipe.loop === true,
    current,
    api,
    audioElement,
    setPlaying,
    setFrame,
    setError,
    setStatus,
    // Walk and Build monitor the track; only Shot replays the take's frames.
    renders: () => (runtime.current?.editor?.mode ?? "shot") === "shot",
    active: () => playingRef.current,
    held: () => settling.current(),
  });
  const run = runWork(setError);
  /** `tune` applies live during Play (Sound routing); `change` stops it first. */
  const tune = (patch: Partial<Recipe>) =>
    run(() => api.current!.configure({ ...current.current, ...patch }));
  const change = (patch: Partial<Recipe>) =>
    run(
      stopping(() => api.current!.configure({ ...current.current, ...patch })),
    );
  const add = async (shape: Shape) => {
    const id = `${shape}-${crypto.randomUUID().slice(0, 8)}`;
    await api.current!.configure(
      withAddedSceneObject(current.current, {
        id,
        shape,
        x: current.current.targetX,
        y: 1,
        z: current.current.targetZ,
        scale: 1,
        spin: 0,
        color: "#b7cad8",
        prompt: "",
      }),
    );
    return id;
  };
  const handoff = sessionHandoffs(api, take, setFrame, setStatus);
  const example = useExampleTrack(audioName);
  return {
    canvas,
    audioElement,
    recipe,
    frame,
    busy,
    capturing,
    progress,
    error,
    status,
    take,
    audioURL,
    audioName,
    history,
    loadAudio: (blob: Blob, source: AudioSource, label?: string) =>
      stopping(() => loader.current(blob, source, label))(),
    mediaName,
    playing,
    ...playback.sound,
    setPlaying,
    stopping,
    settled,
    loop,
    setLoop,
    api,
    track,
    ready,
    json,
    setJson,
    run,
    change,
    tune,
    add,
    ...handoff,
    canSendToDirector: Boolean(host()),
    example,
    setFrame,
    setStatus,
    setAudioName,
    setMediaName,
    setAudioURL,
    runtime,
    onTake,
  };
}

export type BuilderSession = ReturnType<typeof useBuilderSession>;

import type { CharacterPose } from "../../shared/scene/characters";
import { worldControl } from "../../shared/world-control";
import { CREATURE_SHA256 } from "../../shared/scene/creature-reference";
import { creatureMotionReceipt } from "../scene3d/creature-fbx";
import { localCreature } from "../scene3d/creature";
import { BUILDER_CHARACTER_MODELS } from "./character-catalog";
import { LOCAL_MOTIONS } from "../scene3d/creature-slots";
import {
  availableCharacterClips,
  characterAudioForAsset,
} from "./character-audio-options";
import type { WorldRuntime } from "./runtime";
import type { SceneAdapter } from "./useBuilderSession";
import { png, hash, type Take } from "./export-take";

export function liveSession(
  canvas: HTMLCanvasElement,
  world: WorldRuntime,
  adapter: Pick<SceneAdapter, "getRecipe" | "configure">,
  onTake: (take: Take) => void,
  onError: (message: string) => void,
  ready: () => void = () => {},
) {
  let recorder: MediaRecorder | undefined, timer: ReturnType<typeof setTimeout>;
  let stopping: Promise<Take> | undefined;
  let chunks: Blob[] = [],
    bytes = 0,
    started = 0;
  let first: Blob,
    events: { seconds: number; state: unknown }[] = [];
  let sample: ReturnType<typeof setInterval>;
  let finish: (() => void) | undefined;
  const status = () => ({
    ...world.editor?.state(),
    recording: recorder?.state === "recording",
    recordingBusy: recorder !== undefined,
    recipe: adapter.getRecipe(),
    creatureLoaded: !!localCreature(),
    motions: Object.keys(
      BUILDER_CHARACTER_MODELS[adapter.getRecipe().avatarAsset].clips,
    ).filter(
      (p) =>
        adapter.getRecipe().avatarAsset !== "creature" ||
        !LOCAL_MOTIONS.includes(p as CharacterPose) ||
        p in creatureMotionReceipt(),
    ),
  });
  async function stopRecording() {
    if (stopping) return stopping;
    if (!recorder || recorder.state !== "recording")
      throw new Error("No live recording is running.");
    const active = recorder;
    stopping = (async () => {
      clearTimeout(timer);
      clearInterval(sample);
      const ended = new Promise<void>((resolve) => {
        finish = resolve;
      });
      active.stop();
      await ended;
      active.stream.getTracks().forEach((t) => t.stop());
      if (bytes > 128 * 1024 * 1024)
        throw new Error("Live clip exceeded 128 MB.");
      const video = new Blob(chunks, { type: active.mimeType });
      const name = `world-session-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const manifest = new Blob(
        [
          JSON.stringify(
            {
              version: 1,
              mode: "live-session",
              requestedFps: 30,
              duration: (performance.now() - started) / 1000,
              recipe: adapter.getRecipe(),
              events,
              timing:
                "Real-time browser recording; frame delivery depends on rendering performance.",
              sha256: { video: await hash(video), first: await hash(first) },
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const take = { mode: "live" as const, name, first, video, manifest };
      onTake(take);
      return take;
    })().finally(() => {
      recorder = undefined;
    });
    return stopping;
  }
  return {
    status,
    async control(value: unknown) {
      ready();
      const input = worldControl.parse(value);
      const recipe = adapter.getRecipe();
      if (recipe.scene === "neuro") throw new Error("Choose a 3D set first.");
      if (input.character)
        await adapter.configure({
          ...recipe,
          avatar: true,
          avatarAsset: input.character,
          avatarMotion: "idle",
          ...(recipe.characterAudio
            ? {
                characterAudio: characterAudioForAsset(
                  recipe.characterAudio,
                  input.character,
                  availableCharacterClips(
                    input.character,
                    creatureMotionReceipt(),
                  ),
                ),
              }
            : {}),
          creatureReference:
            input.character === "creature"
              ? { sha256: CREATURE_SHA256, motions: creatureMotionReceipt() }
              : null,
        });
      if (!adapter.getRecipe().avatar)
        throw new Error("Choose a character first.");
      if (
        input.action &&
        input.action !== "jump" &&
        !status().motions.includes(input.action)
      )
        throw new Error(
          `Attach the ${input.action} motion before triggering it.`,
        );
      world.editor?.control(input);
      return status();
    },
    async startRecording() {
      ready();
      if (recorder) throw new Error("Recording is already running.");
      if (world.editor?.mode !== "walk")
        throw new Error("Enter Walk mode first.");
      if (!window.MediaRecorder || !canvas.captureStream)
        throw new Error("Live recording needs a browser with MediaRecorder.");
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mimeType) throw new Error("WebM recording is unavailable.");
      recorder = new MediaRecorder(canvas.captureStream(30), {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });
      try {
        first = await png(canvas);
      } catch (error) {
        recorder.stream.getTracks().forEach((t) => t.stop());
        recorder = undefined;
        throw error;
      }
      chunks = [];
      bytes = 0;
      events = [];
      stopping = undefined;
      started = performance.now();
      recorder.ondataavailable = ({ data }) => {
        bytes += data.size;
        if (bytes <= 128 * 1024 * 1024) chunks.push(data);
        else void stopRecording().catch((e) => onError(String(e)));
      };
      recorder.onstop = () => finish?.();
      recorder.onerror = () => {
        onError("Live recording failed.");
        finish?.();
      };
      sample = setInterval(
        () =>
          events.push({
            seconds: (performance.now() - started) / 1000,
            state: status(),
          }),
        100,
      );
      recorder.start(250);
      timer = setTimeout(() => {
        void stopRecording().catch((e) => onError(String(e)));
      }, 30000);
      return status();
    },
    stopRecording,
    stop() {
      world.editor?.stop();
      return status();
    },
    dispose() {
      clearTimeout(timer);
      clearInterval(sample);
      if (recorder?.state === "recording") recorder.stop();
      recorder?.stream.getTracks().forEach((t) => t.stop());
    },
  };
}
export type LiveSession = ReturnType<typeof liveSession>;

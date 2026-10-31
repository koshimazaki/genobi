import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canonical } from "../../shared/memory/state";
import { decodeAudio, audioWav, type AudioTrack } from "./audio";
import { audioLabel } from "./audio-history";
import { buildAcousticSchedule } from "./acoustic-schedule";
import {
  renderDynamicRoomAudio,
  type RoomTailPolicy,
} from "./dynamic-room-audio";
import { hash } from "./export-take";
import type { BuilderSession } from "./useBuilderSession";
import {
  roomSoundReceipt,
  roomTestImpulses,
  type RoomSoundSource,
  type RoomSoundReceipt,
} from "./room-sound-receipt";

export interface RoomSoundSettings {
  treatment: "dynamic" | "static";
  wet: number;
  dry: number;
  tail: RoomTailPolicy;
}
export interface RoomSoundOutput {
  wav: Blob;
  receipt: RoomSoundReceipt;
  recipeKey: string;
  duration: number;
}
const defaultSettings: RoomSoundSettings = {
  treatment: "dynamic",
  wet: 0.35,
  dry: 1,
  tail: "extend",
};

/** Local, independent dry-source lifecycle. Every async result has a freshness guard. */
export function useRoomSound(s: BuilderSession) {
  const session = useRef(s);
  session.current = s;
  const [source, setSource] = useState<RoomSoundSource | null>(null);
  const sourceRef = useRef(source);
  const [settings, setSettings] = useState(defaultSettings);
  const settingsRef = useRef(settings);
  const [output, setOutput] = useState<RoomSoundOutput | null>(null);
  const outputRef = useRef(output);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0),
    sourceGeneration = useRef(0),
    alive = useRef(true);
  const previewing = useRef(false);
  const previewGeneration = useRef(0);

  const invalidate = useCallback((message = "") => {
    generation.current++;
    previewGeneration.current++;
    abort.current?.abort();
    abort.current = null;
    if (previewing.current) {
      session.current.stopSoundPreview();
      previewing.current = false;
    }
    outputRef.current = null;
    setOutput(null);
    setRendering(false);
    setProgress({ completed: 0, total: 0 });
    if (message) setStatus(message);
  }, []);
  const recipeKey = useMemo(() => canonical(s.recipe), [s.recipe]);
  const lastRecipe = useRef(recipeKey);
  useEffect(() => {
    if (lastRecipe.current === recipeKey) return;
    lastRecipe.current = recipeKey;
    invalidate("Scene changed. Render room sound again.");
  }, [recipeKey, invalidate]);
  useEffect(() => {
    if (!s.playing) previewing.current = false;
  }, [s.playing]);
  useEffect(() => {
    if (!output) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(output.wav);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [output]);
  const close = useCallback(() => {
    alive.current = false;
    generation.current++;
    sourceGeneration.current++;
    previewGeneration.current++;
    abort.current?.abort();
    if (previewing.current) session.current.stopSoundPreview();
  }, []);
  useEffect(() => {
    alive.current = true;
    return close;
  }, [close]);

  async function selectSource(
    blob: Blob,
    label: string,
    origin: RoomSoundSource["origin"],
    decoded?: AudioTrack,
  ) {
    const ticket = ++sourceGeneration.current;
    invalidate("Preparing dry room source…");
    sourceRef.current = null;
    setSource(null);
    setLoading(true);
    setError("");
    try {
      if (blob.size > 32 * 1024 * 1024)
        throw new Error("Dry room source limit: 32 MB.");
      const [track, sha256] = await Promise.all([
        decoded ?? decodeAudio(blob),
        hash(blob),
      ]);
      if (!alive.current || ticket !== sourceGeneration.current) return;
      const next = {
        blob,
        label: audioLabel(label, "file"),
        origin,
        track,
        sha256,
      };
      sourceRef.current = next;
      setSource(next);
      setStatus("Dry source ready. Render to hear it inside this room.");
    } catch (e) {
      if (alive.current && ticket === sourceGeneration.current)
        setError(String((e as Error).message ?? e));
    } finally {
      if (alive.current && ticket === sourceGeneration.current)
        setLoading(false);
    }
  }

  function changeSettings(patch: Partial<RoomSoundSettings>) {
    invalidate("Sound settings changed. Render again to update the result.");
    settingsRef.current = { ...settingsRef.current, ...patch };
    setSettings(settingsRef.current);
  }

  async function render() {
    const current = session.current,
      picked = sourceRef.current;
    if (
      !picked ||
      current.busy ||
      current.capturing ||
      !current.ready ||
      !current.api.current
    )
      return;
    invalidate();
    setError("");
    const ticket = generation.current;
    const controller = new AbortController();
    abort.current = controller;
    const frozen = current.api.current.getRecipe();
    const frozenKey = canonical(frozen);
    const revision = current.api.current.getRecipeRevision();
    const options = { ...settingsRef.current };
    const fresh = () =>
      alive.current &&
      ticket === generation.current &&
      sourceRef.current === picked &&
      !controller.signal.aborted &&
      session.current.api.current?.getRecipeRevision() === revision &&
      canonical(session.current.api.current.getRecipe()) === frozenKey;
    setRendering(true);
    setStatus("Rendering geometry CPU room sound…");
    try {
      const schedule = buildAcousticSchedule(frozen, {
        static: options.treatment === "static",
      });
      const result = await renderDynamicRoomAudio(picked.track, schedule, {
        wet: options.wet,
        dry: options.dry,
        tail: options.tail,
        signal: controller.signal,
        onProgress: (completed, total) => {
          if (fresh()) setProgress({ completed, total });
        },
      });
      const receipt = await roomSoundReceipt(frozen, picked, result);
      if (!fresh()) {
        if (alive.current && ticket === generation.current)
          setStatus(
            "Inputs changed while rendering. Render again; the old result was discarded.",
          );
        return;
      }
      const next = {
        wav: result.wav,
        receipt,
        recipeKey: frozenKey,
        duration: receipt.output.seconds,
      };
      outputRef.current = next;
      setOutput(next);
      setStatus(
        `Ready · ${result.schedule.treatment} room · ${receipt.output.seconds.toFixed(2)} s audio`,
      );
    } catch (e) {
      if (
        alive.current &&
        ticket === generation.current &&
        !controller.signal.aborted
      )
        setError(String((e as Error).message ?? e));
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        if (alive.current) setRendering(false);
      }
    }
  }

  async function preview() {
    const current = session.current,
      ready = outputRef.current;
    if (
      !ready ||
      !audio.current ||
      current.busy ||
      current.capturing ||
      rendering
    )
      return;
    const ticket = ++previewGeneration.current;
    try {
      current.setPlaying(false);
      await current.settled();
      if (
        ticket !== previewGeneration.current ||
        ready !== outputRef.current ||
        !alive.current ||
        session.current.busy ||
        session.current.capturing ||
        !session.current.ready ||
        !current.api.current ||
        canonical(current.api.current.getRecipe()) !== ready.recipeKey
      )
        return;
      previewing.current = true;
      current.playSoundPreview(audio.current, ready.duration);
    } catch (e) {
      previewing.current = false;
      if (alive.current) setError(String((e as Error).message ?? e));
    }
  }

  return {
    source,
    settings,
    output,
    url,
    audio,
    loading,
    rendering,
    progress,
    status,
    error,
    render,
    preview,
    changeSettings,
    cancel: () => invalidate("Room sound render cancelled."),
    loadFile: (file: File) => selectSource(file, file.name, "file"),
    testImpulses: () => {
      const generated = roomTestImpulses(session.current.recipe);
      return selectSource(
        generated.blob,
        "Test impulses",
        "test-impulses",
        generated.track,
      );
    },
    useControl: () => {
      const control = session.current.track.current;
      if (!control) return;
      const duration =
        session.current.recipe.frames / session.current.recipe.fps;
      const length = Math.round(duration * control.sampleRate);
      const track: AudioTrack = {
        channels: control.channels.map((channel) => channel.slice(0, length)),
        sampleRate: control.sampleRate,
        envelope: [],
      };
      return selectSource(
        audioWav(track, duration),
        `Copy of ${session.current.audioName || "control track"}`,
        "control-copy",
        track,
      );
    },
  };
}
export type RoomSound = ReturnType<typeof useRoomSound>;

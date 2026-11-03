import type { Recipe } from "./recipe";
import type { WorldRuntime } from "./runtime";
import { TAKE_FRAMES } from "./take-duration";
import {
  openInputAudio,
  type InputAudio,
  type InputSignals,
} from "./input-audio";

export interface InputTakeState {
  phase: "idle" | "requesting" | "recording" | "preparing";
  frame: number;
  signals?: InputSignals;
}
interface InputTakeDependencies {
  world: Pick<WorldRuntime, "configure" | "renderFrame" | "editor">;
  getRecipe(): Recipe;
  ready(): void;
  stopPlayback(): void;
  settle(): Promise<unknown>;
  lock(locked: boolean): void;
  alive(): boolean;
  load(blob: Blob): Promise<void>;
  state(value: InputTakeState): void;
  frame(value: number): void;
  status(value: string): void;
  open?: typeof openInputAudio;
}

/** Only the current signal pair is populated; the saved recipe is never changed. */
export function inputSignalRecipe(
  base: Recipe,
  frame: number,
  signals: InputSignals,
): Recipe {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= base.frames ||
    frame >= TAKE_FRAMES.max
  )
    throw new Error("Input frame is outside the take.");
  const pulse = (value: number) => {
    const samples = Array(
      Math.min(base.frames, TAKE_FRAMES.max, frame + 2),
    ).fill(0) as number[];
    samples[frame] = value;
    if (frame + 1 < samples.length) samples[frame + 1] = value;
    return samples;
  };
  return {
    ...base,
    // Sparse live windows cannot identify prepared onsets. Replay the recording first.
    ...(base.characterAudio
      ? { characterAudio: { ...base.characterAudio, enabled: false } }
      : {}),
    envelope: pulse(signals.level),
    bandEnvelopes: {
      sub: pulse(signals.sub),
      low: pulse(signals.low),
      mid: pulse(signals.mid),
      high: pulse(signals.high),
    },
  };
}

/** Bounded live preview followed by ordinary offline recording analysis. */
export function createInputTakeSession(deps: InputTakeDependencies) {
  let phase: InputTakeState["phase"] = "idle";
  let abort: AbortController | undefined, input: InputAudio | undefined;
  let animation = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const state = (value: InputTakeState) => {
    phase = value.phase;
    if (!disposed && deps.alive()) deps.state(value);
  };
  const stop = () => input?.stop();
  const cancel = () => {
    abort?.abort();
    input?.cancel();
  };
  const visibility = () => {
    if (document.hidden) stop();
  };
  const clearSchedule = () => {
    cancelAnimationFrame(animation);
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", visibility);
  };
  return {
    async start() {
      if (disposed || phase !== "idle")
        throw new Error("Audio input is already active or closed.");
      deps.ready();
      const base = structuredClone(deps.getRecipe());
      deps.stopPlayback();
      deps.lock(true);
      state({ phase: "requesting", frame: 0 });
      abort = new AbortController();
      let drawing = Promise.resolve(),
        restored = false,
        drawError: unknown;
      let releaseEdits: (() => void) | undefined;
      const restore = async () => {
        if (restored) return;
        restored = true;
        await drawing.catch(() => {});
        if (!disposed && deps.alive()) {
          deps.world.configure(base);
          await deps.world.renderFrame(0);
          deps.frame(0);
        }
      };
      try {
        // Opening is synchronous until permission is requested, retaining the gesture.
        const opening = (deps.open ?? openInputAudio)(abort.signal);
        await Promise.all([
          deps.settle(),
          opening.then((value) => {
            input = value;
          }),
        ]);
        if (abort.signal.aborted || disposed) return;
        deps.world.editor?.setMode("shot", false);
        releaseEdits = deps.world.editor?.holdEdits();
        const started = performance.now();
        let previousFrame = -1;
        input!.start();
        state({ phase: "recording", frame: 0 });
        deps.status(
          "Recording the default audio input. Stop to prepare a repeatable take.",
        );
        const tick = () => {
          if (phase !== "recording" || disposed) return;
          const frame = Math.min(
            base.frames - 1,
            Math.floor(((performance.now() - started) * base.fps) / 1000),
          );
          if (frame === previousFrame) {
            animation = requestAnimationFrame(tick);
            return;
          }
          previousFrame = frame;
          let signals: InputSignals;
          try {
            signals = input!.sample();
          } catch (error) {
            drawError = error;
            cancel();
            return;
          }
          drawing = Promise.resolve()
            .then(async () => {
              if (disposed || phase !== "recording") return;
              deps.world.configure(inputSignalRecipe(base, frame, signals));
              await deps.world.renderFrame(frame);
              if (disposed || phase !== "recording") return;
              deps.frame(frame);
              state({ phase: "recording", frame, signals });
            })
            .then(
              () => {
                if (phase === "recording" && !disposed)
                  animation = requestAnimationFrame(tick);
              },
              (error: unknown) => {
                drawError = error;
                cancel();
              },
            );
        };
        tick();
        timer = setTimeout(stop, (base.frames / base.fps) * 1000);
        document.addEventListener("visibilitychange", visibility);
        const blob = await input!.done;
        state({ phase: "preparing", frame: previousFrame });
        clearSchedule();
        await restore();
        releaseEdits?.();
        releaseEdits = undefined;
        deps.lock(false);
        if (abort.signal.aborted || disposed || !deps.alive()) return;
        deps.status(
          "Preparing the recorded synth input for repeatable playback.",
        );
        await deps.load(blob);
        if (!disposed && deps.alive())
          deps.status(
            "Synth input saved. Play, scrub or capture with the recorded audio.",
          );
      } catch (error) {
        if (drawError) throw drawError;
        if (!abort.signal.aborted && !disposed) throw error;
      } finally {
        clearSchedule();
        abort.abort();
        input?.cancel();
        try {
          await restore();
        } finally {
          releaseEdits?.();
          input = undefined;
          abort = undefined;
          if (!disposed && deps.alive()) deps.lock(false);
          state({ phase: "idle", frame: 0 });
        }
      }
    },
    stop,
    cancel,
    dispose() {
      disposed = true;
      clearSchedule();
      cancel();
    },
    status: () => phase,
  };
}
export type InputTakeSession = ReturnType<typeof createInputTakeSession>;

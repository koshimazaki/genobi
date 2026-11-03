import { createMotionPreset } from "../src/world-builder/motion-presets";
import { validateRecipe } from "../src/world-builder/recipe";
import { audioWav, type AudioTrack } from "../src/world-builder/audio";
import type { AcousticSchedule } from "../src/world-builder/acoustic-schedule";
import type { DynamicRoomResult } from "../src/world-builder/dynamic-room-audio";
import { ROOM_AUDIO_ENGINE } from "../src/world-builder/scene-room-ir";

export function shortRoomRecipe() {
  const recipe = createMotionPreset("apartment-morph");
  return validateRecipe({
    ...recipe,
    seconds: null,
    frames: 9,
    motion: {
      ...recipe.motion!,
      stateKeys: recipe.motion!.stateKeys.map((key, i) => ({
        ...key,
        frame: i * 4,
      })),
    },
  });
}

/** A render boundary fixture; DSP correctness is tested with exact convolution separately. */
export function renderedRoomFixture(
  input: AudioTrack,
  schedule: AcousticSchedule,
): DynamicRoomResult {
  const length = Math.round(schedule.duration * input.sampleRate);
  const track: AudioTrack = {
    channels: input.channels.map(() => new Float32Array(length)),
    sampleRate: input.sampleRate,
    envelope: [],
  };
  return {
    track,
    wav: audioWav(track, schedule.duration),
    schedule,
    engine: ROOM_AUDIO_ENGINE,
    wet: 0.35,
    dry: 1,
    tail: "trim-fade",
    tailSeconds: 0,
    trimFadeSeconds: 0.05,
    peakGain: 1,
    irs: [{ key: "fixture", rt60: 0.7, seconds: 1, truncated: false }],
  };
}

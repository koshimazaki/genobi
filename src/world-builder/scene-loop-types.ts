import type { Recipe } from "./recipe";
import type { SceneMotion } from "./scene-state";
import type { SceneCameraMotion } from "./scene-camera";
import type { SceneRotation } from "./scene-rotation";
import type { SceneStateAudio } from "./scene-state-audio";
import type { SnapshotCamera } from "./scene-snapshot-camera";
import type { CharacterAudio } from "./character-audio";
import type { ModRoute } from "./mod-routes";

export const SCENE_LOOP_SLOTS = ["A", "B", "C", "D"] as const;
export type SceneLoopSlot = 0 | 1 | 2 | 3;
export type SceneLoopAudio = Pick<Recipe, "envelope" | "bandEnvelopes">;
export interface SceneLoopSnapshot {
  version: 1;
  label: string;
  sourceFrame: number;
  /** One authored arrangement at frame zero, without a saved soundtrack. */
  recipe: Recipe;
  camera: SnapshotCamera;
}
export interface SceneLoopBank {
  version: 1;
  slots: [
    SceneLoopSnapshot | null,
    SceneLoopSnapshot | null,
    SceneLoopSnapshot | null,
    SceneLoopSnapshot | null,
  ];
}
export interface SceneLoopCaptureOptions {
  label?: string;
  camera?: SnapshotCamera;
  editing?: boolean;
}
export interface SceneLoopOptions {
  durationSeconds?: number;
  style?: NonNullable<SceneMotion["transitionStyle"]>;
  rotation?: SceneRotation;
  returnToStart?: boolean;
  audio?: SceneLoopAudio;
  stateAudio?: SceneStateAudio;
  characterAudio?: CharacterAudio;
  audioRoutes?: ModRoute[];
  /** Explicit whole-loop override. Only camera fields are copied. */
  camera?: Recipe;
  cameraOrbit?: SceneRotation;
  cameraAudio?: SceneCameraMotion["audio"];
}

import type { LiveSession } from "./live-session";
import type { Recipe, parameterSchema } from "./recipe";
import type { Take } from "./export-take";
import type { SentTake } from "./send-take";

export interface SceneAdapter {
  live: LiveSession;
  describe(): {
    version: number;
    renderers: string[];
    parameters: typeof parameterSchema;
    /** Range of a recipe's `seconds`, the move's duration (frames follow it). */
    seconds: { min: number; max: number };
    capabilities: string[];
  };
  getRecipe(): Recipe;
  configure(input: unknown): Promise<Recipe>;
  render(frame: number): Promise<void>;
  /**
   * Capture a fixed-frame take. From Walk or Build, the viewport is first
   * frozen into the recipe as the shot camera and the mode returns to Shot.
   */
  capture(options?: { name?: string }): Promise<Take>;
  snapshot(): Promise<Blob>;
  /** Frame zero of the linear depth pass as a PNG. */
  snapshotDepth(): Promise<Blob>;
  setScreen(blob: Blob): Promise<void>;
  setSurface(target: string, blob: Blob): Promise<void>;
  clearSurface(target: string): Promise<void>;
  setAudio(blob: Blob): Promise<void>;
  cancel(): void;
  /**
   * The scene library (`useSceneLibrary`), attached once the World Builder
   * view mounts: preset names, load one by name (stops Play, returns to
   * Shot, keeps the current sound), and this browser's takes, newest first.
   */
  listPresets?(): PresetSummary[];
  loadPreset?(name: string): Promise<Recipe>;
  listTakes?(): TakeSummary[];
  /**
   * The paired agent's `capture` command: the Capture button's take under
   * the given name, refused in Walk or while another take is being made,
   * resolved once the take is in the Takes library.
   */
  captureTake?(name: string): Promise<Take>;
  /**
   * The paired agent's `send-to-project` command: the library card's Send
   * to Director for the take with this id, or the newest of this name.
   */
  sendTake?(take: string): Promise<SentTake>;
}

export interface PresetSummary {
  name: string;
  source: "built-in" | "saved";
  summary: string;
  /** A move-library preset's file name (`fall-cathedral`); load-preset takes it too. */
  file?: string;
}
export interface TakeSummary {
  id: string;
  name: string;
  mode: "fixed" | "live";
  seconds: number;
  frames: number | null;
  bytes: number;
  createdAt: string;
}

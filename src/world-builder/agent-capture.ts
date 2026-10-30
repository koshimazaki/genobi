import { WORLD_TAKE_NAME, type WorldFile } from "../../shared/world-control";
import type { Take } from "./export-take";

/** What the paired agent's capture must check before it runs. */
export interface CaptureGate {
  /** The editor's mode now: "shot", "edit" or "walk". */
  mode(): string | undefined;
  /** A live recording is running. */
  recording(): boolean;
  /** A take is being captured, or the scene is loading. */
  busy(): boolean;
  /** A take's MP4 is being added to project assets. */
  saving(): boolean;
}

/**
 * The refusals, in the words the World Builder already uses. Walk is refused
 * rather than frozen as the Capture button does: leaving Walk saves the walked
 * position through its own configure, which an agent cannot see finish.
 */
export function assertCanCapture(gate: CaptureGate) {
  if (gate.mode() === "walk")
    throw new Error("Return to Shot camera before capture.");
  if (gate.recording()) throw new Error("Stop live recording first.");
  if (gate.busy())
    throw new Error("Stop preview or wait for the current operation.");
  if (gate.saving())
    throw new Error("Wait for the take being added to assets.");
}

/**
 * The agent's `capture`: the Capture button's take under `name`, resolved
 * once the take is in the Takes library (`kept`), so a `takes` command sent
 * straight after lists it.
 */
export async function agentCapture(
  gate: CaptureGate,
  capture: (name: string) => Promise<Take>,
  kept: (take: Take) => Promise<unknown>,
  name: string,
) {
  if (typeof name !== "string" || !WORLD_TAKE_NAME.test(name))
    throw new Error(
      "Name the take with up to 64 letters, digits, hyphens or underscores.",
    );
  assertCanCapture(gate);
  const take = await capture(name);
  await kept(take);
  return take;
}

/** A take's files under the names the paired session serves them by. */
export function takeFiles(take: Take): [WorldFile, Blob][] {
  const files: [WorldFile, Blob | undefined][] = [
    ["clip.webm", take.video],
    ["first.png", take.first],
    ["receipt.json", take.manifest],
    ["depth.webm", take.depth],
    ["depth-first.png", take.depthFirst],
    ["audio.wav", take.audio],
  ];
  return files.filter((f): f is [WorldFile, Blob] => f[1] !== undefined);
}

/** What the command result says about a fixed take: its receipt, no bytes. */
export async function takeFacts(take: Take) {
  const receipt = JSON.parse(await take.manifest.text()) as {
    frameCount: number;
    duration: number;
    passes: string[];
    recipe: { width: number; height: number; fps: number };
  };
  return {
    name: take.name,
    frames: receipt.frameCount,
    width: receipt.recipe.width,
    height: receipt.recipe.height,
    fps: receipt.recipe.fps,
    seconds: receipt.duration,
    passes: receipt.passes,
    audio: take.audio !== undefined,
  };
}

import { create } from "zustand";
import { emptySlots } from "../shared/ltx-prompt";
import { emptyLight } from "../shared/light";
import {
  readDeployInput,
  type DeployInput,
} from "../shared/comfy/deploy-input";
import type { ComposerState } from "./useComposer";
import type { Take } from "./world-builder/export-take";
import { validateRecipe } from "./world-builder/recipe";
import { useSettingsStore } from "./settings-store";
import { request } from "./useJobs";

export const LAYOUT_CAPTURE = {
  width: 1024,
  height: 576,
  frames: 193,
  seconds: 8,
} as const;

/** Accept the builder's Save recipe or Capture receipt, retaining the complete scene. */
export function layoutRecipe(text: string) {
  if (new TextEncoder().encode(text).length > 64000)
    throw new Error("Choose a capture recipe or receipt under 64 KB.");
  const value = JSON.parse(text);
  const raw = value?.recipe ?? value;
  readDeployInput({
    seed: 0,
    negativePrompt: "",
    assets: {},
    recipe: JSON.stringify(raw),
  });
  const recipe = validateRecipe(raw);
  return readDeployInput({
    seed: 0,
    negativePrompt: "",
    assets: {},
    recipe: JSON.stringify(recipe),
  }).recipe!;
}

export interface CapturedLayout {
  id: string;
  name: string;
  endpoint: string;
  recipe: string;
  prompt: string;
  files: Record<string, Blob>;
}
export const useLayoutTake = create<{ pending?: CapturedLayout }>(() => ({}));

/** Pure capture conversion: use the take's frozen receipt, never the subsequently edited scene. */
export async function capturedLayout(
  take: Take,
  endpoint: string,
): Promise<CapturedLayout> {
  if (take.mode === "live")
    throw new Error(
      "Capture a fixed-frame take for Layout-to-video; live recordings do not have its frame grid.",
    );
  const recipe = layoutRecipe(await take.manifest.text());
  const files = {
    TAKE_WEBM: take.video,
    REFERENCE_PNG: take.first,
    ...(take.depth ? { DEPTH_WEBM: take.depth } : {}),
    ...(take.audio ? { TRACK_AUDIO: take.audio } : {}),
  };
  if (
    Object.values(files).some(
      (file) => file.size === 0 || file.size > 150_000_000,
    )
  )
    throw new Error("Keep each captured input between 1 byte and 150 MB.");
  return {
    id: crypto.randomUUID(),
    name: take.name,
    endpoint,
    recipe,
    prompt: JSON.parse(recipe).prompt,
    files,
  };
}

/** A browser-only handoff. No upload, quote, submission or project mutation. */
export async function queueLayoutTake(take: Take) {
  const endpoint = useSettingsStore.getState().runLocation?.deployment?.url;
  if (!endpoint)
    throw new Error(
      "Register your Comfy deployment in Settings → Generation setup, then send the take again.",
    );
  const pending = await capturedLayout(take, endpoint);
  useLayoutTake.setState({ pending });
}

export const layoutComposer = (
  take: CapturedLayout,
): Partial<ComposerState> => ({
  generator: "video",
  model: "ltx-deploy-layout-to-video",
  description: take.prompt,
  cameraEnabled: false,
  slots: emptySlots,
  light: emptyLight,
  lightEdits: {},
  deploy: { seed: 0, negativePrompt: "", recipe: take.recipe, assets: {} },
});

/** Explicit staging only; endpoint changes discard this attempt's tickets. No paid route. */
export async function stageLayoutTake(
  take: CapturedLayout,
  key: string,
  endpoint = () => useSettingsStore.getState().runLocation?.deployment?.url,
  stage = request<{ id: string }>,
): Promise<Pick<DeployInput, "recipe" | "assets">> {
  const check = () => {
    if (endpoint() !== take.endpoint)
      throw new Error(
        "The deployment changed. Send the captured take from 3D again before attaching.",
      );
  };
  const assets: Record<string, string> = {};
  check();
  for (const [token, file] of Object.entries(take.files)) {
    const { id } = await stage(`/api/settings/deployment-assets/${token}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        ...(key ? { "x-byo-key": key } : {}),
      },
      body: file,
    });
    check();
    assets[token] = id;
  }
  return { recipe: take.recipe, assets };
}

export function clearLayoutTake(id: string) {
  if (useLayoutTake.getState().pending?.id === id)
    useLayoutTake.setState({ pending: undefined });
}

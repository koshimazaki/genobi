import type { RefObject } from "react";
import type { SceneAdapter } from "./scene-adapter";
import type { Take } from "./export-take";
import { send } from "./session-io";

/**
 * The embedded hand-offs: the first frame (and its depth) to the connected
 * Director or Comfy editor, and a take to the Comfy editor. In the studio,
 * `useBuilderAssets` adds them to the project instead.
 */
export function sessionHandoffs(
  api: RefObject<SceneAdapter | null>,
  take: Take | null,
  setFrame: (frame: number) => void,
  setStatus: (status: string) => void,
) {
  const firstFrame = () => api.current!.snapshot();
  async function toDirector() {
    const blob = await firstFrame();
    const depth = await api.current!.snapshotDepth();
    send({
      type: "director:capture",
      blob,
      depth,
      recipe: api.current!.getRecipe(),
    });
    setFrame(0);
    setStatus(
      "First frame sent to the connected Director / Comfy editor. Review it before generating.",
    );
  }
  async function toComfy() {
    const result = take ?? (await api.current!.capture());
    send({
      type: "director:take",
      video: result.video,
      first: result.first,
      depth: result.depth ?? null,
      recipe: api.current!.getRecipe(),
      audio: result.audio ?? null,
    });
    setStatus("Take sent to the connected Comfy editor.");
  }
  return { firstFrame, toDirector, toComfy };
}

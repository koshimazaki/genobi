import { useEffect, useRef, useState } from "react";
import type { Take } from "./export-take";
import { takeToMp4 } from "./take-mp4";
import type { BuilderSession } from "./useBuilderSession";
import { addedMessage, type AddAsset } from "../studio/project-assets";
import { recordWorldRecipe } from "../studio/world-record";
import { applyRoom, recipeRoom, type RoomChoice } from "./apply-room";
import { DIRECTOR_MEDIA_BYTES } from "../../shared/director/types";
import { TOO_LARGE } from "./send-take";
import { takeRecipe } from "./take-recipe";
import { studioStore } from "../studio/store";

/**
 * Where a capture goes. In the studio (`onAsset`, the shared project-assets
 * path), Capture take records the take and adds it to the project's assets
 * as an MP4 under Project, with its matching WAV when the scene has sound,
 * and Send first frame adds the still under Inspirations, where the Director
 * and Camera can both use it. Embedded as a scene adapter (no `onAsset`), the
 * session's postMessage hand-off is kept. Nothing here starts a generation.
 */
export function useBuilderAssets(
  s: BuilderSession,
  onAsset?: AddAsset,
  onLayoutTake?: (take: Take) => Promise<void>,
) {
  const [saving, setSaving] = useState<"" | "take" | "frame" | "room">("");
  const [result, setResult] = useState("");
  const [capturedRoom, setCapturedRoom] = useState<{
    take: Take;
    room?: RoomChoice;
    problem?: string;
  }>();
  const take = s.take;
  const activeTake = useRef(take);
  const canAddAssets = Boolean(onAsset);
  useEffect(() => {
    activeTake.current = take;
    let current = true;
    if (canAddAssets && take?.audio && take.mode !== "live")
      void takeRecipe(take).then(
        (recipe) => {
          if (current) setCapturedRoom({ take, room: recipeRoom(recipe) });
        },
        () => {
          if (current)
            setCapturedRoom({
              take,
              problem:
                "This take has no valid recipe receipt. Capture a new take before applying its room.",
            });
        },
      );
    return () => {
      current = false;
      activeTake.current = null;
    };
  }, [take, canAddAssets]);
  const encoding = useRef<AbortController | null>(null);
  useEffect(() => () => encoding.current?.abort(), []);
  /**
   * The take as MP4 (with its WAV) under Project; resolves to what was
   * added. Dimensions and provenance come from the take's own receipt.
   */
  async function addTake(take: Take) {
    if (!onAsset) return undefined;
    // The re-encode keeps roughly the WebM's size, so a take already past the
    // project's media limit is refused before minutes of encoding.
    if (take.video.size > DIRECTOR_MEDIA_BYTES) throw new Error(TOO_LARGE);
    const before = studioStore.getState().director.bundle;
    const recipe = await takeRecipe(take);
    const abort = new AbortController();
    encoding.current = abort;
    setSaving("take");
    setResult("");
    try {
      const mp4 = await takeToMp4(take.video, recipe, abort.signal);
      if (studioStore.getState().director.bundle !== before)
        throw new Error("Project changed. Send the take again.");
      const video = await onAsset({
        blob: mp4,
        filename: `${take.name}.mp4`,
        use: "production",
      });
      const audio =
        take.audio &&
        (await onAsset({
          blob: take.audio,
          filename: `${take.name}.wav`,
          use: "production",
        }));
      setResult(
        [video, audio]
          .filter((added) => !!added)
          .map(addedMessage)
          .join(" "),
      );
      // The project keeps the recipe that made its take (Download bundle).
      recordWorldRecipe(recipe);
      return { video, audio: audio || undefined };
    } finally {
      if (encoding.current === abort) encoding.current = null;
      setSaving("");
    }
  }
  async function captureTake() {
    setResult("");
    await addTake(await s.api.current!.capture());
  }
  async function sendFirstFrame() {
    if (!onAsset) return s.toDirector();
    setSaving("frame");
    setResult("");
    try {
      const blob = await s.firstFrame();
      s.setFrame(0);
      setResult(
        addedMessage(
          await onAsset({
            blob,
            filename: "world-first-frame.png",
            use: "reference",
          }),
        ),
      );
    } finally {
      setSaving("");
    }
  }
  /** A room belongs to its capture, never to the subsequently edited scene. */
  const checkedRoom = capturedRoom?.take === take ? capturedRoom : undefined;
  const room = checkedRoom?.room;
  async function roomTake() {
    const take = s.take;
    if (!onAsset || !take?.audio || take.mode === "live") return;
    const before = studioStore.getState().director.bundle;
    const check = () => {
      if (activeTake.current !== take)
        throw new Error(
          "Take changed. Apply the room to the selected take again.",
        );
      if (studioStore.getState().director.bundle !== before)
        throw new Error("Project changed. Apply the take's room again.");
    };
    setSaving("room");
    setResult("");
    try {
      const room = recipeRoom(await takeRecipe(take));
      if (!room) throw new Error("This take has no enclosed room to apply.");
      check();
      setResult(
        addedMessage(
          await applyRoom(take.audio, take.name, room, (media) => {
            check();
            return onAsset(media);
          }),
        ),
      );
    } finally {
      setSaving("");
    }
  }
  return {
    captureTake,
    /** Space on the take's WAV in its own room, added to project assets. */
    room: onAsset ? room : undefined,
    applyRoom: roomTake,
    sendFirstFrame,
    /** Adds any take (one from the scene library too) as MP4, with its WAV. */
    addTake,
    /** Adds the current take (a live clip too) again; the same bytes are kept once. */
    addCurrentTake: () =>
      s.take ? addTake(s.take).then(() => {}) : Promise.resolve(),
    /** Stops a take's MP4 encode; the take and its WebM stay. */
    cancelAdd: () =>
      encoding.current?.abort(new Error("Adding the take was cancelled.")),
    saving,
    result: (onAsset && checkedRoom?.problem) || result,
    canSend: Boolean(onAsset) || s.canSendToDirector,
    toLayout: onLayoutTake
      ? async () => {
          if (s.take) await onLayoutTake(s.take);
        }
      : undefined,
    toAssets: Boolean(onAsset),
  };
}

export type BuilderAssets = ReturnType<typeof useBuilderAssets>;

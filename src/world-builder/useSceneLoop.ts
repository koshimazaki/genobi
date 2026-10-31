import { useEffect, useRef, useState } from "react";
import type { Recipe } from "./recipe";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import type { SceneStateAudio } from "./scene-state-audio";
import type { SceneRotation } from "./scene-rotation";
import {
  composeSceneLoop,
  removeSceneLoopSlot,
  saveSceneLoopSlot,
  sceneLoopSlotRecipe,
  SCENE_LOOP_SLOTS,
  type SceneLoopBank,
  type SceneLoopOptions,
  type SceneLoopSlot,
} from "./scene-loop";
import { readLoopSlots, storeLoopSlots } from "./scene-loop-storage";
import { loopCameraName } from "./scene-loop-camera";
import { framesForSeconds, takeSeconds } from "./take-duration";
import { errorText } from "./session-io";

const freshAudio = (): SceneStateAudio => ({
  version: 1,
  enabled: false,
  amount: 0.65,
  routes: SCENE_LOOP_SLOTS.map((letter, index) => ({
    stateId: `loop-${letter}`,
    source: (["low", "mid", "high", "sub"] as const)[index],
    amount: 1,
    enabled: true,
  })),
});

export interface SceneLoopCameraSelection {
  id: number;
  recipe: Recipe;
}

/** The saved bank belongs to the loop desk, never to the currently loaded asset. */
export function useSceneLoop(
  s: BuilderSession,
  e: WorldEditor,
  onSaveLoop: (name: string) => Promise<void>,
  cameraSelection?: SceneLoopCameraSelection,
) {
  const [initial] = useState(readLoopSlots),
    [bank, setBank] = useState(initial.bank),
    [active, setActive] = useState<SceneLoopSlot>(0),
    [visible, setVisible] = useState(
      Math.max(
        2,
        ...initial.bank.slots.map((slot, index) => (slot ? index + 1 : 0)),
      ),
    ),
    [frames, setFrames] = useState(framesForSeconds(8)),
    [style, setStyle] =
      useState<NonNullable<SceneLoopOptions["style"]>>("direct"),
    [camera, setCamera] = useState<Recipe>(),
    [orbit, setOrbit] = useState<SceneRotation>(),
    [rotation, setRotation] = useState<SceneRotation>(),
    [audio, setAudio] = useState(freshAudio),
    [working, setWorking] = useState(""),
    [notice, setNotice] = useState(initial.notice),
    [error, setError] = useState("");
  const pending = useRef(false),
    cameraIntent = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!cameraSelection || cameraIntent.current === cameraSelection.id) return;
    cameraIntent.current = cameraSelection.id;
    setCamera(structuredClone(cameraSelection.recipe));
    setOrbit(
      cameraSelection.recipe.cameraMotion?.enabled
        ? cameraSelection.recipe.cameraMotion.orbit
        : undefined,
    );
  }, [cameraSelection]);

  const locked = !s.ready || s.busy || Boolean(working) || e.mode === "walk";
  const filled = bank.slots.filter(Boolean).length;
  const remember = (next: SceneLoopBank, message: string) => {
    setBank(next);
    setNotice(
      `${message}${storeLoopSlots(next) ? "" : " Kept for this tab only; browser storage is unavailable."}`,
    );
  };
  const act = (label: string, action: () => Promise<void>) => {
    if (locked || pending.current) return;
    pending.current = true;
    setWorking(label);
    setError("");
    setNotice("");
    void action()
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => {
        pending.current = false;
        setWorking("");
      });
  };
  const settle = async () => {
    if (s.runtime.current?.editor?.dragging)
      throw new Error("Finish moving the view or object first.");
    s.setPlaying(false);
    await s.settled();
    if (!s.api.current) throw new Error("The scene is still starting.");
    return s.api.current;
  };
  const apply = async (next: Recipe, expectedRevision: string) => {
    const adapter = s.api.current!;
    e.chooseMode("shot", false);
    await adapter.configure(next, { expectedRevision });
    e.select("");
    await adapter.render(0);
  };
  const compose = async () => {
    const adapter = await settle(),
      current = adapter.getRecipe(),
      expectedRevision = adapter.getRecipeRevision();
    const override = camera ? structuredClone(camera) : undefined;
    if (override?.cameraMotion) delete override.cameraMotion.orbit;
    const next = composeSceneLoop(bank, {
      durationSeconds: takeSeconds(frames),
      style,
      returnToStart: true,
      audio: current,
      characterAudio: current.characterAudio,
      audioRoutes: current.audioRoutes,
      stateAudio: audio,
      camera: override,
      cameraOrbit: orbit,
      cameraAudio: camera?.cameraMotion?.audio ?? current.cameraMotion?.audio,
      rotation,
    });
    await apply(next, expectedRevision);
  };
  const select = (index: SceneLoopSlot) => {
    if (locked) return;
    if (!bank.slots[index]) {
      setActive(index);
      setError("");
      setNotice(
        `Choose an asset or frame the scene, then Save ${SCENE_LOOP_SLOTS[index]}.`,
      );
      return;
    }
    act("Loading view", async () => {
      const adapter = await settle(),
        current = adapter.getRecipe(),
        expectedRevision = adapter.getRecipeRevision();
      await apply(sceneLoopSlotRecipe(bank, index, current), expectedRevision);
      setActive(index);
      setNotice(
        `Recalled ${SCENE_LOOP_SLOTS[index]}. Save ${SCENE_LOOP_SLOTS[index]} to keep changes to this view.`,
      );
    });
  };
  const save = () => {
    const editor = s.runtime.current?.editor,
      cameraPose = editor?.cameraPose(),
      frame = s.runtime.current?.frame ?? s.frame,
      editing = e.mode === "edit",
      expectedRevision = s.api.current?.getRecipeRevision();
    act("Saving view", async () => {
      const adapter = await settle();
      if (adapter.getRecipeRevision() !== expectedRevision)
        throw new Error(
          "The scene changed while saving. Save this view again.",
        );
      const recipe = adapter.getRecipe(),
        key = recipe.motion?.stateKeys.reduce((nearest, item) =>
          Math.abs(item.frame - frame) < Math.abs(nearest.frame - frame)
            ? item
            : nearest,
        ),
        label =
          key?.label ??
          `${recipe.scene === "playground" ? "Playground" : "Scene"} view`,
        next = saveSceneLoopSlot(bank, active, recipe, frame, {
          camera: cameraPose,
          editing,
          label,
        });
      remember(next, `Saved shape and camera as ${SCENE_LOOP_SLOTS[active]}.`);
      // A first save advances to the next empty destination without recalling it.
      if (!bank.slots[active]) {
        const nextEmpty = next.slots.findIndex(
          (slot, index) => index < visible && !slot,
        );
        if (nextEmpty >= 0) setActive(nextEmpty as SceneLoopSlot);
      }
    });
  };
  const clear = () => {
    if (locked || !bank.slots[active]) return;
    s.setPlaying(false);
    remember(
      removeSceneLoopSlot(bank, active),
      `Cleared ${SCENE_LOOP_SLOTS[active]}. The current scene stays available to save.`,
    );
    setError("");
  };
  const draft =
    <T>(set: (value: T) => void) =>
    (value: T) => {
      s.setPlaying(false);
      set(value);
    };
  const startLetter =
    SCENE_LOOP_SLOTS[Math.max(0, bank.slots.findIndex(Boolean))];
  return {
    bank,
    active,
    visible,
    frames,
    style,
    orbit,
    rotation,
    audio,
    locked,
    working,
    filled,
    startLetter,
    notice,
    error,
    cameraMode: camera ? "current" : "saved",
    cameraName: camera ? loopCameraName(camera) : "Saved views",
    select,
    save,
    clear,
    setFrames: draft<number>(setFrames),
    setStyle: draft<NonNullable<SceneLoopOptions["style"]>>(setStyle),
    setOrbit: draft<SceneRotation | undefined>(setOrbit),
    setRotation: draft<SceneRotation | undefined>(setRotation),
    setAudio: draft<SceneStateAudio>(setAudio),
    setCameraMode: (mode: "saved" | "current") => {
      s.setPlaying(false);
      const next = mode === "current" ? s.api.current?.getRecipe() : undefined;
      setCamera(next);
      if (next)
        setOrbit(
          next.cameraMotion?.enabled ? next.cameraMotion.orbit : undefined,
        );
    },
    add: () => {
      if (locked || visible >= 4) return;
      setActive(visible as SceneLoopSlot);
      setVisible(visible + 1);
    },
    play: () => {
      if (s.playing) return s.setPlaying(false);
      act("Preparing loop", async () => {
        await compose();
        s.setLoop(true);
        s.setPlaying(true);
      });
    },
    saveLoop: () =>
      act("Saving loop", async () => {
        await compose();
        const name = `${bank.slots.flatMap((slot, index) => (slot ? [SCENE_LOOP_SLOTS[index]] : [])).join("-")}-loop`;
        await onSaveLoop(name);
        setNotice(`Saved ${name} in Takes.`);
      }),
  };
}

export type SceneLoopController = ReturnType<typeof useSceneLoop>;

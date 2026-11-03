import { useEffect, useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import type { Mode, Tool } from "./interaction";
import type { Shape, Recipe, Prop } from "./recipe";
import { validSurface } from "./scene-contract";
import {
  editableSceneObjects,
  patchSceneObject,
  removeSceneObject,
  sceneEditFrame,
} from "./scene-editing";
export function useWorldEditor(s: BuilderSession) {
  const [mode, setMode] = useState<Mode>("shot"),
    [tool, setTool] = useState<Tool>("translate"),
    [selected, setSelected] = useState("");
  const editor = s.runtime.current?.editor;
  function chooseMode(next: Mode, redraw = true) {
    if (s.previewOnly && next !== "shot") return;
    // Play stops before the mode changes, so leaving Walk commits an idle pose.
    s.setPlaying(false);
    editor?.setMode(next);
    setMode(next);
    if (next !== "walk" && redraw) {
      const frame = sceneEditFrame(s.recipe, s.frame);
      s.setFrame(frame);
      s.run(async () => {
        await s.settled();
        await s.runtime.current!.renderFrame(frame);
      });
    }
  }
  function chooseTool(next: Tool) {
    setTool(next);
    editor?.setTool(next);
  }
  useEffect(() => {
    if (!editor) return;
    editor.onSelect = setSelected;
    editor.onMode = setMode;
    setSelected(editor.selection);
    return () => {
      editor.onSelect = () => {};
      editor.onMode = () => {};
    };
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    const canvas = s.canvas.current!;
    const key = (e: KeyboardEvent) => {
      if (editor.mode !== "edit" || e.ctrlKey || e.metaKey || e.altKey) return;
      const next = (
        { KeyW: "translate", KeyE: "rotate", KeyR: "scale" } as const
      )[e.code as "KeyW"];
      if (next) {
        e.preventDefault();
        setTool(next);
        editor.setTool(next);
      }
    };
    canvas.addEventListener("keydown", key);
    return () => canvas.removeEventListener("keydown", key);
  }, [editor, s.canvas]);
  useEffect(() => {
    if (s.recipe.scene === "neuro" && editor?.mode !== "shot") {
      editor?.setMode("shot");
      setMode("shot");
    }
  }, [editor, s.recipe.scene]);
  const objects = editableSceneObjects(s.recipe, s.frame);
  const prop = objects.find((p) => `prop:${p.id}` === selected);
  const authored = s.recipe.objects.some((p) => `prop:${p.id}` === selected);
  const transform = prop ?? s.runtime.current?.getLayout(selected);
  function patchObject(patch: Partial<Prop>) {
    if (prop) s.change(patchSceneObject(s.recipe, s.frame, prop.id, patch));
    else if (transform)
      s.change({
        layout: {
          ...s.recipe.layout,
          [selected]: {
            ...transform,
            ...patch,
            rotation: patch.rotation ?? transform.rotation ?? 0,
          },
        },
      });
  }
  function remove() {
    if (!prop || !authored) return;
    const objects = s.recipe.objects.filter((p) => p.id !== prop.id);
    const next = {
      ...s.recipe,
      objects,
      ...(s.recipe.motion
        ? { motion: removeSceneObject(s.recipe, prop.id) }
        : {}),
      // A route to a removed primitive goes with it.
      audioRoutes: s.recipe.audioRoutes.filter(
        (route) => route.target !== `prop:${prop.id}`,
      ),
    };
    s.change({
      ...next,
      textures: Object.fromEntries(
        Object.entries(next.textures).filter(([key]) =>
          validSurface(key, next),
        ),
      ),
    });
    editor?.select("");
  }
  async function add(shape: Shape) {
    chooseMode("edit");
    const id = await s.add(shape);
    editor?.select(`prop:${id}`);
  }
  function preset(recipe: Recipe) {
    chooseMode("shot");
    s.run(() =>
      s.api.current!.configure({
        ...recipe,
        envelope: s.recipe.envelope,
        bandEnvelopes: s.recipe.bandEnvelopes,
      }),
    );
    editor?.select("");
  }
  return {
    mode,
    tool,
    selected,
    prop,
    objects,
    authored,
    transform,
    editState: (index: number) => {
      const key = s.recipe.motion?.stateKeys[index];
      if (!key) return;
      s.setPlaying(false);
      editor?.setMode("edit");
      setMode(s.previewOnly ? "shot" : "edit");
      s.run(async () => {
        await s.settled();
        await s.api.current!.render(key.frame);
      });
    },
    chooseMode,
    chooseTool,
    patchObject,
    remove,
    add,
    preset,
    select: (id: string) => editor?.select(id),
    useView: () => {
      if (editor) {
        const patch = editor.viewPatch();
        // chooseMode stops Play (and its edit lock) before the shot changes.
        chooseMode("shot");
        s.run(
          s.stopping(() =>
            s.api.current!.configure({
              ...s.api.current!.getRecipe(),
              ...patch,
              ...(s.recipe.cameraMotion
                ? { cameraMotion: { ...s.recipe.cameraMotion, enabled: false } }
                : {}),
            }),
          ),
        );
      }
    },
  };
}
export type WorldEditor = ReturnType<typeof useWorldEditor>;

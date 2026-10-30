import { useEffect, useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import type { Mode, Tool } from "./interaction";
import type { Shape, Recipe, Prop } from "./recipe";
import { validSurface } from "./scene-contract";
export function useWorldEditor(s: BuilderSession) {
  const [mode, setMode] = useState<Mode>("shot"),
    [tool, setTool] = useState<Tool>("translate"),
    [selected, setSelected] = useState("");
  const editor = s.runtime.current?.editor;
  function chooseMode(next: Mode) {
    // Play stops before the mode changes, so leaving Walk commits an idle pose.
    s.setPlaying(false);
    editor?.setMode(next);
    setMode(next);
    if (next !== "walk") {
      s.setFrame(0);
      s.run(async () => {
        await s.settled();
        await s.runtime.current!.renderFrame(0);
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
  const prop = s.recipe.objects.find((p) => `prop:${p.id}` === selected);
  const transform = prop ?? s.runtime.current?.getLayout(selected);
  function patchObject(patch: Partial<Prop>) {
    if (prop)
      s.change({
        objects: s.recipe.objects.map((p) =>
          p.id === prop.id ? { ...p, ...patch } : p,
        ),
      });
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
    if (!prop) return;
    const objects = s.recipe.objects.filter((p) => p.id !== prop.id);
    const next = {
      ...s.recipe,
      objects,
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
    transform,
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
            }),
          ),
        );
      }
    },
  };
}
export type WorldEditor = ReturnType<typeof useWorldEditor>;

import { useEffect } from "react";
import { readWorldFiles } from "../director/world-files";
import { useStudio } from "../studio/useStudio";
import type { SceneSpec } from "./scenes";

/**
 * The scene the open project carries (`world/scene.json`, from Load scene or
 * an opened bundle) is offered among the loaded scenes, so Open bundle reads
 * it back. It is not selected for the person.
 */
export function useProjectScene(
  setLoaded: (update: (list: SceneSpec[]) => SceneSpec[]) => void,
) {
  const bundle = useStudio((s) => s.director.bundle);
  useEffect(() => {
    if (!bundle) return;
    let scene: SceneSpec | undefined;
    try {
      scene = readWorldFiles(bundle).scene as SceneSpec | undefined;
    } catch {
      return;
    }
    if (!scene) return;
    const spec = scene;
    setLoaded((list) =>
      list.some((s) => s.id === spec.id) ? list : [...list, spec],
    );
  }, [bundle, setLoaded]);
}

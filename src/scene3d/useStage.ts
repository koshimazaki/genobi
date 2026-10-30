import { useEffect, useRef, useState } from "react";
import type { CameraPathPose } from "../../shared/camera-path";
import type { ObjectPose } from "./gestures";
import type { SceneSpec } from "./scenes";
import { createStage, type Stage } from "./stage";
import { prepareCharacters } from "./characters";

/** True while the visitor asks for reduced motion; follows changes. */
export function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

/**
 * Owns the Three.js stage on `canvas`: builds it once, loads the scene,
 * rebuilds colours when the theme changes and draws the given pose. It
 * draws only when an input changes; playback drives it from the panel.
 */
export function useStage(
  scene: SceneSpec,
  pose: CameraPathPose,
  object: ObjectPose,
  seconds = 0,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const [failed, setFailed] = useState(false);
  const [prepared, setPrepared] = useState<SceneSpec>();
  const [assetError, setAssetError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current;
    try {
      stage.current = createStage(element);
    } catch {
      setFailed(true);
      return;
    }
    const theme = new MutationObserver(() => stage.current?.retheme());
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    element.addEventListener("webglcontextlost", lost);
    return () => {
      theme.disconnect();
      element.removeEventListener("webglcontextlost", lost);
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setAssetError("");
    setPrepared(undefined);
    void prepareCharacters(scene)
      .then(() => {
        if (!active || !stage.current) return;
        stage.current.load(scene);
        setPrepared(scene);
      })
      .catch((error: unknown) => {
        if (active)
          setAssetError(
            error instanceof Error
              ? error.message
              : "Scene assets could not load.",
          );
      });
    return () => {
      active = false;
    };
  }, [scene, attempt]);
  useEffect(() => {
    stage.current?.render(pose, object, seconds);
  }, [pose, object, scene, seconds, prepared]);
  return {
    canvas,
    stage,
    failed,
    assetError,
    retry: () => setAttempt((n) => n + 1),
    ready: prepared === scene && !failed && !assetError,
  };
}

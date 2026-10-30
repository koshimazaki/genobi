import { cameraLabel, type CameraSelection } from "../../shared/camera";
import type { VideoModel } from "../../shared/types";
import { useEffect, useRef, useState } from "react";
import { createCameraScene } from "./create-camera-scene";

type Props = {
  selection: CameraSelection;
  /** The panel's model, so the spoken label names the same terms. */
  model?: VideoModel;
  replay?: number;
};
type CameraScene = ReturnType<typeof createCameraScene>;

export default function CameraPreview({ selection, model, replay = 0 }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CameraScene | null>(null);
  const latestPreset = useRef(selection);
  latestPreset.current = selection;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    try {
      scene.current = createCameraScene(element);
    } catch {
      setUnavailable(true);
      return;
    }
    const theme = new MutationObserver(() => {
      scene.current?.dispose();
      scene.current = null;
      try {
        scene.current = createCameraScene(element);
        scene.current.play(latestPreset.current, media.matches);
        setUnavailable(false);
      } catch {
        setUnavailable(true);
      }
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const visibility = () => scene.current?.setVisible(!document.hidden);
    const motion = () =>
      scene.current?.play(latestPreset.current, media.matches);
    const contextLost = (event: Event) => {
      event.preventDefault();
      scene.current?.dispose();
      scene.current = null;
      setUnavailable(true);
    };
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    element.addEventListener("webglcontextlost", contextLost);
    return () => {
      theme.disconnect();
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
      element.removeEventListener("webglcontextlost", contextLost);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.play(
      selection,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, [selection, replay]);

  return (
    <div
      role="img"
      aria-label={`Illustrative camera path: ${cameraLabel(selection, model)}`}
      className="camera-scene"
    >
      <canvas
        ref={canvas}
        aria-hidden="true"
        style={{
          display: unavailable ? "none" : "block",
          height: "100%",
          width: "100%",
        }}
      />
      {unavailable && (
        <p
          style={{
            padding: "4.5em 1.5em",
            textAlign: "center",
            color: "var(--soft)",
          }}
        >
          3D preview unavailable. Your camera selection still applies.
        </p>
      )}
    </div>
  );
}

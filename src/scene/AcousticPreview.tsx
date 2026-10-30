import { acousticLabel, type AcousticSetting } from "../../shared/acoustic";
import { useEffect, useRef, useState } from "react";
import { createAcousticScene } from "./create-acoustic-scene";

type Props = { setting: AcousticSetting | null; replay?: number };
type AcousticScene = ReturnType<typeof createAcousticScene>;

export default function AcousticPreview({ setting, replay = 0 }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<AcousticScene | null>(null);
  const latestPreset = useRef(setting);
  latestPreset.current = setting;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    try {
      scene.current = createAcousticScene(element);
    } catch {
      setUnavailable(true);
      return;
    }
    const theme = new MutationObserver(() => {
      scene.current?.dispose();
      scene.current = null;
      try {
        scene.current = createAcousticScene(element);
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
      setting,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, [setting, replay]);

  return (
    <div
      role="img"
      aria-label={`Illustrative acoustic space: ${setting ? acousticLabel(setting) : "None"}`}
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
          3D preview unavailable. Your acoustic selection still applies.
        </p>
      )}
    </div>
  );
}

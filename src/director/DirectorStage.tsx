import { useCallback, useRef, useState } from "react";
import Icon from "../components/Icon";
import ProgramLightbox from "./ProgramLightbox";
import type { Project } from "../../shared/director/types";

export default function DirectorStage({
  project,
  canvas,
  ready,
  firstFrame = false,
  status,
  overlay = "",
}: {
  project?: Project;
  /** Told which canvas is mounted, so the renderer draws into it. */
  canvas: (element: HTMLCanvasElement | null) => void;
  ready: boolean;
  /** The renderer has not drawn its first frame; the canvas is blank. */
  firstFrame?: boolean;
  status: string;
  /** Trim readout while an edge is dragged. */
  overlay?: string;
}) {
  const [enlarged, setEnlarged] = useState(false);
  // The lightbox mirrors this canvas; the runtime is told it mounted.
  const own = useRef<HTMLCanvasElement>(null);
  const mounted = useCallback(
    (element: HTMLCanvasElement | null) => {
      own.current = element;
      canvas(element);
    },
    [canvas],
  );
  return (
    <section className="dir-stage" aria-label="Composition preview">
      <div className="dir-stage-meta">
        <span>PROGRAM</span>
        <span>
          {project
            ? `${project.composition.width} × ${project.composition.height} / ${project.composition.fps} FPS`
            : "—"}
        </span>
        <button
          type="button"
          className="dir-enlarge"
          aria-label="Enlarge preview"
          title="Enlarge preview (or double-click it)"
          disabled={!project}
          onClick={() => setEnlarged(true)}
        >
          <Icon name="expand" size={13} />
        </button>
      </div>
      <canvas
        ref={mounted}
        aria-label="Director preview"
        onDoubleClick={() => project && setEnlarged(true)}
        style={{
          aspectRatio: project
            ? `${project.composition.width} / ${project.composition.height}`
            : "16 / 9",
          width: "auto",
          maxWidth: "100%",
          maxHeight: "60vh",
        }}
      />
      {firstFrame && (
        <span className="dir-stage-pending" role="status">
          Rendering the first frame…
        </span>
      )}
      {/* Absolute, so sized stage layouts keep the canvas as their flex child. */}
      {overlay && (
        <span className="dir-trim-readout" role="status">
          {overlay}
        </span>
      )}
      {enlarged && (
        <ProgramLightbox
          source={own}
          title="Program"
          close={() => setEnlarged(false)}
        />
      )}
      <div className="dir-stage-footer">
        <span className={ready ? "dir-live" : ""}>{status}</span>
        <span>
          {project
            ? `${project.layers.length} layers · ${Object.keys(project.assets).length} assets`
            : ""}
        </span>
      </div>
    </section>
  );
}

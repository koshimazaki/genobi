import { useState, type CSSProperties, type ReactNode } from "react";
import type { Project } from "../../shared/director/types";
import ResizeHandle from "../components/ResizeHandle";
import ProjectDirection from "./ProjectDirection";

/**
 * Editor: the global prompt above Program and the finished output, divided
 * by a resize handle. Both monitors share one flow and stack in narrow panels.
 */
export default function ProgramRow({
  advanced,
  project,
  selected,
  disabled,
  command,
  children,
  output,
}: {
  advanced: boolean;
  project?: Project;
  selected: string;
  disabled: boolean;
  command: (command: unknown) => string;
  children: ReactNode;
  output?: ReactNode;
}) {
  const [width, setWidth] = useState(560);
  if (!advanced)
    return (
      <>
        {children}
        {output}
      </>
    );
  return (
    <div
      className="dir-program-row"
      style={{ "--program-width": `${width}px` } as CSSProperties}
    >
      {project && (
        <ProjectDirection
          project={project}
          selected={selected}
          disabled={disabled}
          command={command}
        />
      )}
      <div className="dir-monitor-panes">
        {children}
        <ResizeHandle
          label="Preview width"
          value={width}
          min={240}
          max={1200}
          change={setWidth}
        />
        {output ?? (
          <section
            className="dir-output-empty"
            aria-label="Finished video and usage report"
          >
            <h2>Finished video</h2>
            <p>
              Render MP4 to review and download the finished composition here.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

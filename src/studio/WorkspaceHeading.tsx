import type { ReactNode } from "react";
import { PresetIcon } from "./PresetIcon";

/** The tool's identity stays separate from the project being edited. */
export function WorkspaceHeading({
  title,
  icon,
  purpose,
  project,
  children,
}: {
  title: string;
  icon: string;
  purpose: string;
  project?: string;
  children?: ReactNode;
}) {
  return (
    <div className="workspace-heading">
      <div className="workspace-heading__identity">
        <h1>
          <PresetIcon name={icon} />
          {title}
        </h1>
        <p>{purpose}</p>
      </div>
      {project && (
        <span className="workspace-heading__project">Project · {project}</span>
      )}
      {children}
    </div>
  );
}

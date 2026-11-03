import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { versionTemplate } from "../../shared/templates/version";
import { useStudio } from "../studio/useStudio";
import { useShell } from "../studio/ShellContext";
import VersionPanel from "./VersionPanel";
import "./version.css";

/**
 * Make my version, one header action for Director and Editor; opening
 * overlays the stable studio. It opens only when the person presses it (or
 * the Director's own button asks): Director and Editor open on the timeline.
 * Swap only (#57): it never starts an agent or a generation.
 */
export default function GenerateVersionAction({
  disabled,
  request = 0,
}: {
  disabled: boolean;
  request?: number;
}) {
  const bundle = useStudio((s) => s.director.bundle);
  const template = bundle && versionTemplate(bundle.project);
  const shell = useShell();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const projectId = bundle?.project.id;
  // A remount with an old request count is not a fresh user action.
  const previousRequest = useRef(request);
  const previousProject = useRef(projectId);
  const visible =
    !shell || shell.preset === "director" || shell.preset === "editor";
  useEffect(() => {
    if (request > previousRequest.current) setOpen(true);
    previousRequest.current = request;
  }, [request]);
  useEffect(() => {
    // Never carry an open swap dialog to another project's assets.
    if (previousProject.current !== projectId) setOpen(false);
    previousProject.current = projectId;
  }, [projectId]);
  if (!bundle || !template) return null;
  const close = () => {
    setOpen(false);
    queueMicrotask(() => trigger.current?.focus());
  };
  return (
    <>
      <button
        ref={trigger}
        className="dir-primary dir-generate-version"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Make my version
      </button>
      {open &&
        visible &&
        createPortal(
          <VersionPanel
            key={bundle.project.id}
            template={template}
            initial={bundle}
            close={close}
          />,
          document.body,
        )}
    </>
  );
}

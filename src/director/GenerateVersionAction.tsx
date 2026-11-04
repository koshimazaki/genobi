import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { versionTemplate } from "../../shared/templates/version";
import { useStudio } from "../studio/useStudio";
import { useShell } from "../studio/ShellContext";
import VersionPanel from "./VersionPanel";
import { onVersionOpen, takeVersionOpen } from "./version-open-request";
import "./version.css";

/**
 * Make my version, one header action for Director and Editor; opening
 * overlays the stable studio. It never starts a generation; its Make it with
 * the agent section starts an agent session, which quotes each paid step.
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
  const opened = useRef<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const projectId = bundle?.project.id;
  const visible =
    !shell || shell.preset === "director" || shell.preset === "editor";
  // It opens by itself only in Director. The Editor is for editing, not
  // adding, so there it waits for its header button.
  const greets = !shell || shell.preset === "director";
  useEffect(() => {
    if (greets && template && projectId && opened.current !== projectId) {
      opened.current = projectId;
      setOpen(true);
    }
  }, [greets, template, projectId]);
  useEffect(() => {
    if (request) setOpen(true);
  }, [request]);
  // A request from elsewhere (the Camera's Layout to Motion card) opens it
  // once its project is the open one, even after this project greeted.
  useEffect(() => {
    const take = () => {
      if (template && takeVersionOpen(template.id)) {
        opened.current = projectId;
        setOpen(true);
      }
    };
    take();
    return onVersionOpen(take);
  }, [template, projectId]);
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

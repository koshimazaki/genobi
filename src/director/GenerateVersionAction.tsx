import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { versionTemplate } from "../../shared/templates/version";
import { useStudio } from "../studio/useStudio";
import { useShell } from "../studio/ShellContext";
import VersionPanel from "./VersionPanel";
import { useAgentSend } from "./useAgentSend";
import "./version.css";

/** One header for Director and Editor; opening overlays the stable studio. */
export default function GenerateVersionAction({
  disabled,
}: {
  disabled: boolean;
}) {
  const bundle = useStudio((s) => s.director.bundle);
  const template = bundle && versionTemplate(bundle.project);
  const shell = useShell();
  const opened = useRef<string | undefined>(undefined);
  const agent = useAgentSend();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const projectId = bundle?.project.id;
  const visible =
    !shell || shell.preset === "director" || shell.preset === "editor";
  useEffect(() => {
    if (visible && template && projectId && opened.current !== projectId) {
      opened.current = projectId;
      setOpen(true);
    }
  }, [visible, template, projectId]);
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
        disabled={disabled || agent.sending || agent.working}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Generate my version
      </button>
      {agent.note && (
        <div
          className="dir-version-notice"
          role={agent.note.alert ? "alert" : "status"}
        >
          {agent.note.text}
          <button onClick={() => agent.setNote(undefined)}>Dismiss</button>
        </div>
      )}
      {open &&
        visible &&
        createPortal(
          <VersionPanel
            key={bundle.project.id}
            template={template}
            initial={bundle}
            agent={agent}
            close={close}
            startAgent={(instruction) => {
              close();
              void agent.send(instruction);
            }}
          />,
          document.body,
        )}
    </>
  );
}

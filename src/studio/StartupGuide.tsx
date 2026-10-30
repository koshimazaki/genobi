import { useRef, useState } from "react";
import Icon from "../components/Icon";
import { useModalDialog } from "../components/useModalDialog";
import "./startup-guide.css";

export default function StartupGuide({ onCamera }: { onCamera: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => button.current?.focus());
  }
  return (
    <>
      <button
        ref={button}
        className="header-icon"
        aria-label="Startup guide"
        title="Guide"
        onClick={() => setOpen(true)}
      >
        <Icon name="help" size={15} />
      </button>
      {open && (
        <GuideDialog
          onClose={close}
          onCamera={() => {
            close();
            onCamera();
          }}
        />
      )}
    </>
  );
}

function GuideDialog({
  onClose,
  onCamera,
}: {
  onClose: () => void;
  onCamera: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useModalDialog(ref);
  return (
    <dialog
      ref={ref}
      className="key-dialog startup-guide"
      aria-labelledby="startup-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <span className="section-eyebrow">GENOBI / START HERE</span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close startup guide"
          autoFocus
        >
          <Icon name="close" />
        </button>
      </div>
      <h2 id="startup-title">One idea. A whole studio.</h2>
      <p>
        Explore examples and local editing before connecting a generation key.
      </p>
      <ol>
        <li>
          <strong>Find a starting point.</strong>
          <p>
            Browse Gallery templates, or use Camera for a prompt, image or
            video. Its results library sits below the composer.
          </p>
        </li>
        <li>
          <strong>Make the shot.</strong>
          <p>
            Choose your model and camera direction. Connect a Comfy key from the
            key icon when ready; check the cost before confirming a run. With
            FLUX Klein, open Bounding boxes beside Camera controls to draw and
            describe the layout. Recreate restores a new run's prompt, settings,
            source and references saved in this browser.
          </p>
        </li>
        <li>
          <strong>Keep shaping it.</strong>
          <p>
            Plan sheets in Scrolls, compare frames in Dual Swords, and assemble
            a cut in Director or Editor. Assets and Inspirations travel in the
            side rail. Save an editable project ZIP before reloading.
          </p>
        </li>
      </ol>
      <p>
        The book icon opens{" "}
        <a href="/taste" target="_blank" rel="noopener noreferrer">
          Taste references, recipes and credits ↗
        </a>
        . The mic opens voice input. Ninja arranges the panels you need.
      </p>
      <div className="dialog-actions">
        <button className="text-button" onClick={onClose}>
          Explore the studio
        </button>
        <button className="primary-button" onClick={onCamera}>
          Open Camera <Icon name="arrow" />
        </button>
      </div>
      <p className="key-footnote">
        Reopen this guide from the question mark in the header. The welcome
        setup is available from Genobi.
      </p>
    </dialog>
  );
}

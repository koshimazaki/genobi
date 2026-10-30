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
      <h2 id="startup-title">
        Build the scene. Shape the sound. Make the cut.
      </h2>
      <p>
        Genobi is an open-source video studio where you and your agent work on
        the same creative project. Let the agent make a first pass, then move
        clips, adjust timing, add notes or give directions by voice. Your edits
        and instructions guide the next version.
      </p>
      <h3>What you can make</h3>
      <ul>
        <li>
          <strong>Scenes and guided motion.</strong> Build a Three.js world,
          direct its camera and capture visual guidance for LTX workflows in
          ComfyUI. Camera also offers model-specific controls for generation,
          image layouts and look development.
        </li>
        <li>
          <strong>Sound that belongs to the space.</strong> The acoustic nodes
          estimate a room’s response from its geometry and materials, then shape
          the track’s reverb. AKUSPACE is a separate experimental LTX LoRA for
          room-conditioned generated sound.
        </li>
        <li>
          <strong>A cut you can keep editing.</strong> Director and Editor share
          one project and timeline. Use Dual Swords to compare footage and
          extract exact frames; bring real clips, images and audio into Assets.
          Scrolls holds your planning sheets.
        </li>
        <li>
          <strong>Creative direction that carries forward.</strong>{" "}
          <a href="/taste" target="_blank" rel="noopener noreferrer">
            Taste references, recipes and creator credits ↗
          </a>{" "}
          support your direction. Project notes and reusable decisions help your
          agent build on the work. Connect Hermes, Claude Code or Codex through
          the Genobi MCP, CLI and skills.
        </li>
      </ul>
      <h3>Start with a real project</h3>
      <p>
        Open the{" "}
        <a
          href="/director?example=genobi-teaser&amp;workspace=editor"
          target="_blank"
          rel="noopener noreferrer"
        >
          remixable submission video ↗
        </a>{" "}
        or the{" "}
        <a
          href="/director?example=adaptive-reverb&amp;workspace=editor"
          target="_blank"
          rel="noopener noreferrer"
        >
          3D and acoustics demo ↗
        </a>{" "}
        in a new tab. Explore the supplied footage and edit before connecting a
        generation key. Camera shows the cost before you confirm a paid run.
        Save a project ZIP to keep your editable timeline and media.
      </p>
      <h3>Fork it. Run it locally.</h3>
      <p>
        <a
          href="https://github.com/koshimazaki/genobi"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get Genobi on GitHub ↗
        </a>{" "}
        to fork the project, read the setup guide or contribute. With Node.js 22
        or newer, clone your fork (or the public repository), then run:
      </p>
      <pre className="startup-commands">
        <code>{`git clone https://github.com/koshimazaki/genobi.git
cd genobi
npm ci
npm run dev`}</code>
      </pre>
      <p>
        Open{" "}
        <a
          href="http://127.0.0.1:4317"
          target="_blank"
          rel="noopener noreferrer"
        >
          your local studio ↗
        </a>{" "}
        and use Start Genobi to set up your agent. On the hosted site, connect
        it through Settings → Pair hosted and local Genobi first. Hermes runs on
        your computer; the hosted page cannot launch it directly. The mic opens
        voice input once your local connection is ready.
      </p>
      <p className="key-footnote">
        Open-source application code, open-weight local workflows, and optional
        cloud and API routes. Models and third-party components retain their own
        licences; see the GitHub documentation for requirements and terms.
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

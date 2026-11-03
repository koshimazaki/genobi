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
        Genobi is voice-first and harness-first. Talk to it, or let your own
        agent drive it; the screen is mainly for inspecting what comes back and
        viewing your assets. Scenes, sound, generation and the edit share one
        open-source project that you and your agent both work on.
      </p>
      <div className="startup-guide__columns">
        <section aria-labelledby="startup-capabilities">
          <h3 id="startup-capabilities">Two ways in</h3>
          <ul>
            <li>
              <strong>Talk to it.</strong> Press the mic and say what you want.
              Qwen3-ASR transcribes on your own machine and your agent gets the
              text. The first press offers a one-time download: the 1.9 GB model
              plus the voice runtime, with Python 3.11 and ffmpeg already
              installed. A verified copy already on your machine is used
              instead. Voice runs in the local studio only; the hosted site has
              none.{" "}
              <a
                href="https://github.com/koshimazaki/genobi/blob/main/docs/voice-setup.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Voice setup ↗
              </a>
            </li>
            <li>
              <strong>Bring your agent.</strong> Hermes (open source), Claude
              Code or Codex works the same tools you do through the Genobi
              plugin: its MCP server, CLI and skills. Start Genobi sets Hermes
              up for you; for Claude Code, run{" "}
              <code>claude --plugin-dir plugins/genobi</code> in your checkout.
              Anything that costs money waits for your approval in the studio.
            </li>
            <li>
              <strong>The screen is for looking.</strong> Camera shows what came
              back, Assets holds what you dropped in, and the deck along the
              bottom shows what the agent is doing. In World Builder, voice
              edits the scene direction only; ask the agent for anything more.
            </li>
            <li>
              <strong>Start with your files.</strong> Drop your images, video
              and audio into Assets, then tell the agent what they are and what
              you want. No manual needed.{" "}
              <a href="/taste" target="_blank" rel="noopener noreferrer">
                Taste references, recipes and creator credits ↗
              </a>{" "}
              carry your direction into the next version.
            </li>
          </ul>
        </section>
        <section aria-labelledby="startup-project">
          <h3 id="startup-project">Start with a real project</h3>
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
            in a new tab. Explore the supplied footage and edit before
            connecting a generation key. Camera shows the cost before you
            confirm a paid run. Save a project ZIP to keep your editable
            timeline and media.
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
            to fork the project, read the setup guide or contribute. With
            Node.js 22 or newer, clone your fork (or the public repository),
            then run:
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
            and use Start Genobi to set up your agent. On the hosted site,
            connect it through Settings → Pair hosted and local Genobi first.
            Hermes runs on your computer; the hosted page cannot launch it
            directly. Voice input needs the local studio.
          </p>
        </section>
      </div>
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

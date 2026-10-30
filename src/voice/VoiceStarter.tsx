import { useEffect, useRef, useState } from "react";
import { voiceStatus, type VoiceStatus } from "./api";
import { VoiceSetup } from "./VoiceSetup";
import { LocalRunInstructions } from "./LocalRunInstructions";
import { onVoiceReady } from "./install-store";
import "./voice-starter.css";

/** Optional setup: reading status never requests the mic or installs a model. */
export default function VoiceStarter({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [status, setStatus] = useState<VoiceStatus>();
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(
    () => onVoiceReady(window, () => setRefresh((value) => value + 1)),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    void voiceStatus(controller.signal).then(setStatus, () => {});
    return () => controller.abort();
  }, [refresh]);
  function close() {
    setOpen(false);
    button.current?.focus();
  }
  return (
    <section className="voice-starter" aria-labelledby="voice-starter-title">
      <h2 id="voice-starter-title">Add voice, if you want it</h2>
      <p>
        The local Genobi runner transcribes your microphone with Qwen. Voice is
        optional; typed prompts work without it. Setup shows the model and
        download size before you choose to install.
      </p>
      <p role="status">
        {!status
          ? "Checking local voice…"
          : status.available
            ? "Local voice is ready. Use the mic in the studio when you want to speak."
            : status.maxSeconds === 0
              ? "Local voice is unavailable here. Run Genobi on your computer using the instructions below. Connecting this website to a separate local runner is not available yet."
              : "This Genobi server supports local voice setup."}
      </p>
      {status && !status.available && status.maxSeconds > 0 && (
        <button
          ref={button}
          aria-expanded={open}
          aria-controls={open ? "voice-overlay" : undefined}
          onClick={() => setOpen(!open)}
        >
          Set up local voice
        </button>
      )}
      {!embedded && (
        <a className="voice-starter-continue" href="/">
          Continue to studio
        </a>
      )}
      {open && (
        <VoiceSetup
          onClose={close}
          onReady={() => {
            close();
            setRefresh((value) => value + 1);
          }}
        />
      )}
      {!embedded && <LocalRunInstructions />}
    </section>
  );
}

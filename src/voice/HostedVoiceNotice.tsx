import { useEffect, useRef } from "react";
import { HOSTED_VOICE_MESSAGE, LOCAL_SETUP_URL } from "./availability";
import "./voice-setup.css";

export function HostedVoiceNotice() {
  return (
    <div className="hosted-voice-notice">
      <p role="status">{HOSTED_VOICE_MESSAGE}</p>
      <p>
        <a href={LOCAL_SETUP_URL} target="_blank" rel="noreferrer">
          Set up the local studio ↗
        </a>
      </p>
    </div>
  );
}

/** A dismissible, non-modal explanation in the existing mic panel footprint. */
export function HostedVoicePanel({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div
      id="voice-overlay"
      className="voice-setup"
      role="dialog"
      aria-label="Local voice mode"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="voice-setup-head">
        <strong>Local voice mode</strong>
        <button ref={close} aria-label="Close voice" onClick={onClose}>
          ×
        </button>
      </div>
      <HostedVoiceNotice />
    </div>
  );
}

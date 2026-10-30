import { VoiceSetup } from "./VoiceSetup";
import { useEffect, useRef, useState } from "react";
import { voiceStatus, type VoiceStatus } from "./api";
import { trackPromptFocus } from "./prompt-target";
import { VoiceOverlay } from "./VoiceOverlay";
import { micPanel, onVoiceReady, useVoiceInstall } from "./install-store";
import "./voice.css";

/**
 * Voice mode's mic in the studio header (issue #23), beside the theme and the
 * key, in every section. One click opens the pill and records; the next ends
 * the note and transcribes; a click with nothing recording closes the pill.
 * It asks the local server whether transcription is set up each time it
 * opens, and says so when it is not. The pill hangs under the header, so
 * opening it moves nothing.
 */
export default function VoiceButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>();
  const [ready, setReady] = useState(0);
  const installing = !!useVoiceInstall().state?.busy;
  const button = useRef<HTMLButtonElement>(null);
  const mic = useRef<(() => boolean) | undefined>(undefined);
  useEffect(trackPromptFocus, []);
  // An install that finishes elsewhere (setup) makes the mic live. While this
  // panel is open it shows "Start using Voice Mode" instead (onVoiceReady).
  const shown = useRef(open);
  shown.current = open;
  useEffect(
    () =>
      onVoiceReady(
        window,
        () => setReady((value) => value + 1),
        () => shown.current,
      ),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    voiceStatus(controller.signal).then(setStatus, () => {});
    return () => controller.abort();
  }, [open, ready]);
  const unavailable = status && !status.available;
  return (
    <div className="voice-mode">
      <button
        ref={button}
        className="voice-button header-icon"
        aria-label="Voice"
        aria-expanded={open}
        aria-controls={open ? "voice-overlay" : undefined}
        data-available={status ? status.available : undefined}
        data-installing={installing || undefined}
        title={
          installing
            ? "Installing Voice Mode: click to see progress"
            : unavailable
              ? "Install Voice Mode"
              : "Voice: click to record, again to stop; transcribed on this machine"
        }
        onClick={() => {
          if (open && mic.current?.()) return;
          setOpen((value) => !value);
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </svg>
      </button>
      {micPanel(open, status) === "setup" ? (
        <VoiceSetup
          onReady={() => {
            void voiceStatus().then(setStatus);
          }}
          onClose={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      ) : (
        open && (
          <VoiceOverlay
            status={status}
            mic={mic}
            onClose={(returnFocus) => {
              setOpen(false);
              if (returnFocus) button.current?.focus();
            }}
          />
        )
      )}
    </div>
  );
}

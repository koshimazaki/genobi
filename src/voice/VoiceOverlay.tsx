import { useEffect, useRef, useState, type RefObject } from "react";
import type { VoiceStatus } from "./api";
import { useVoiceRecorder } from "./useVoiceRecorder";
import { VoiceDestinations } from "./VoiceDestinations";
import { readVoiceLanguage, saveVoiceLanguage } from "./language-store";
import { VoiceLanguageSelect } from "./VoiceLanguageSelect";
import { VoiceLEDWaveform } from "./VoiceLEDWaveform";
import { VoiceDestinationPicker } from "./VoiceDestinationPicker";
import {
  voiceRouting,
  useVoiceRouting,
  useVoiceDeliveryPending,
  voiceDeliveryPending,
} from "./destination-store";
import { voiceProjectId } from "./agent-destination";

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The voice surface: a thin pill that hangs under the studio header rather
 * than pushing anything. It records as soon as it opens; the mic or Stop
 * ends the note and the local model transcribes; the chevron opens the
 * panel below the pill, which shows where the transcript went (or offers a
 * session) and lets it be corrected. The panel opens by itself when there
 * is something to read. Escape closes it and gives focus back to the Voice
 * button; closing drops a recording in progress.
 */
export function VoiceOverlay({
  status,
  mic,
  onClose,
}: {
  /** Undefined while the server is asked. */
  status: VoiceStatus | undefined;
  /** The header mic's press: true when it stopped a recording. */
  mic: RefObject<((recordOnly?: boolean) => boolean) | undefined>;
  onClose: (returnFocus: boolean) => void;
}) {
  const [language, setLanguage] = useState(readVoiceLanguage);
  const [routing, setRouting] = useState(() => ({
    route: voiceRouting(),
    projectId: voiceProjectId(),
  }));
  const sending = useVoiceDeliveryPending();
  const selectedRouting = useVoiceRouting();
  const voice = useVoiceRecorder(status?.maxSeconds || 60, language);
  const record = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const ready = !!status?.available;
  const { phase } = voice;
  const recording = phase === "recording";
  // Choosing a destination while speaking applies to this note. Once
  // transcription starts, its destination is frozen until delivery completes.
  useEffect(() => {
    if (recording)
      setRouting((before) => ({ ...before, route: selectedRouting }));
  }, [recording, selectedRouting]);
  const working = phase === "transcribing" || phase === "starting" || sending;
  const [expanded, setExpanded] = useState(false);
  // Open the panel for anything to read; only the chevron folds it again.
  const toRead =
    phase === "transcribing" || phase === "done" || !!voice.message;
  const unset = !!status && !ready;
  useEffect(() => {
    if (toRead || unset) setExpanded(true);
  }, [toRead, unset]);

  useEffect(() => {
    (record.current?.disabled ? close.current : record.current)?.focus();
  }, [ready]);
  // One click records: start once the server says voice is set up. A
  // refused microphone ends in its message; nothing starts it again. A tick
  // later, so a mount that is undone at once never asks for the microphone.
  const start = useRef(voice.start);
  start.current = async () => {
    if (voiceDeliveryPending()) return;
    setRouting({ route: voiceRouting(), projectId: voiceProjectId() });
    await voice.start();
  };
  useEffect(() => {
    if (!ready) return;
    const tick = setTimeout(() => void start.current());
    return () => clearTimeout(tick);
  }, [ready]);
  mic.current = (recordOnly = false) => {
    if (recording) {
      if (!recordOnly) voice.stop();
      return true;
    }
    if (recordOnly && ready && !working) {
      void start.current();
      return true;
    }
    return false;
  };
  useEffect(
    () => () => {
      mic.current = undefined;
    },
    [mic],
  );

  const root = useRef<HTMLDivElement>(null);
  // Where routing put focus (Generate, or its prompt): Escape there closes
  // Voice too, and focus stays where it is.
  const handed = useRef<HTMLElement | null>(null);
  const { cancel } = voice;
  function dismiss(returnFocus = true) {
    cancel();
    onClose(returnFocus);
  }
  // Escape from inside the overlay, from the header mic that stopped the
  // note, from where routing put focus, or when focus has fallen to the
  // page. A modal dialog elsewhere holds focus itself and keeps its own
  // Escape.
  const escape = useRef(dismiss);
  escape.current = dismiss;
  useEffect(() => {
    const keyDown = (event: globalThis.KeyboardEvent) => {
      const active = document.activeElement;
      if (event.key !== "Escape") return;
      const kept = !!active && active === handed.current;
      if (
        !kept &&
        !(
          active === document.body ||
          root.current?.contains(active) ||
          root.current?.closest(".voice-mode")?.contains(active)
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      escape.current(!kept);
    };
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, []);

  const state = !status
    ? "CHECKING"
    : !ready
      ? "NOT SET UP"
      : recording
        ? `LISTENING ${clock(voice.seconds)}`
        : phase === "starting"
          ? "MICROPHONE"
          : phase === "transcribing"
            ? "TRANSCRIBING"
            : "READY";

  return (
    <div
      id="voice-overlay"
      className="voice-overlay"
      role="dialog"
      aria-label="Voice"
      ref={root}
      data-phase={phase}
      data-expanded={expanded || undefined}
    >
      <div className="voice-pill">
        <button
          ref={record}
          className="voice-record"
          data-recording={recording || undefined}
          disabled={!ready}
          // Busy, not disabled: a disabled button would drop keyboard focus.
          aria-disabled={working || undefined}
          aria-label={recording ? "Stop and transcribe" : "Record"}
          title={recording ? "Stop and transcribe" : "Record"}
          onClick={() => {
            if (recording) voice.stop();
            else if (!working) void start.current();
          }}
        >
          <span aria-hidden="true" />
        </button>
        <VoiceLEDWaveform
          levels={voice.levels}
          mode={phase === "transcribing" ? "working" : "listening"}
        />
        <VoiceDestinationPicker disabled={working} />
        <button
          className="voice-chevron"
          aria-label={expanded ? "Hide transcript" : "Show transcript"}
          aria-expanded={expanded}
          aria-controls="voice-details"
          onClick={() => setExpanded((value) => !value)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>
        <button
          ref={close}
          className="voice-close"
          aria-label="Close voice"
          title="Close (Esc)"
          onClick={() => dismiss()}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </div>
      {/* Folded, the panel keeps only the spoken state, for screen readers. */}
      <div id="voice-details" className="voice-details">
        <div className="voice-head">
          <span className="voice-state" aria-live="polite">
            {state}
          </span>
          {expanded && ready && (
            <VoiceLanguageSelect
              value={language}
              offered={status.languages}
              onChange={(next) => {
                setLanguage(next);
                saveVoiceLanguage(next);
              }}
            />
          )}
        </div>
        {expanded && status && !ready && (
          <p className="voice-note">{status.setup}</p>
        )}
        {expanded && voice.message && (
          <p className="voice-note" role="alert">
            {voice.message}
          </p>
        )}
        {/* Folded, not unmounted: it remembers that this transcript already
            started a session, so reopening cannot start another. */}
        {phase === "done" && (
          <div hidden={!expanded}>
            <VoiceDestinations
              transcript={voice.transcript}
              onChange={voice.setTranscript}
              onHandoff={(element) => (handed.current = element)}
              routing={routing.route}
              projectId={routing.projectId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

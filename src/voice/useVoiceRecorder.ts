import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceLanguage } from "../../shared/voice-languages";
import { cancelPrewarm, onPageHide, prewarmVoice } from "./api";
import { deliverNote, openCapture, type Capture } from "./capture";
import { LED_COUNT, ledLevel, measure, METER_HZ, pushLevel } from "./levels";

export type VoicePhase =
  "idle" | "starting" | "recording" | "transcribing" | "done" | "error";

interface Session {
  stream: MediaStream;
  context: AudioContext;
  recorder: MediaRecorder;
  meter: number;
  limit: number;
  parts: Blob[];
  keep: boolean;
}

/** A refusal the person can act on, never the browser's own wording. */
function microphoneMessage(error: unknown) {
  const name = (error as Error)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access was refused. Allow it for this site in the browser's settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found.";
  if (name === "NotReadableError")
    return "The microphone is in use by another app.";
  return "The microphone could not start.";
}

/**
 * One voice note: microphone through MediaRecorder, a 24 Hz WIE level meter
 * for the LEDs, then local transcription. The levels live in a ref so the
 * waveform redraws without re-rendering React at the meter's rate.
 */
export function useVoiceRecorder(maxSeconds: number, language: VoiceLanguage) {
  // Read when the note is sent, so a change while recording still applies.
  const hint = useRef(language);
  hint.current = language;
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState("");
  const [seconds, setSeconds] = useState(0);
  const levels = useRef(new Float32Array(LED_COUNT));
  const session = useRef<Session | undefined>(undefined);
  const request = useRef<AbortController | undefined>(undefined);
  /** Bumped by cancel, so a permission prompt answered late starts nothing. */
  const attempt = useRef(0);

  const release = useCallback(() => {
    const open = session.current;
    session.current = undefined;
    if (!open) return;
    clearInterval(open.meter);
    clearTimeout(open.limit);
    open.stream.getTracks().forEach((track) => track.stop());
    void open.context.close().catch(() => {});
    levels.current.fill(0);
  }, []);

  const finish = useCallback(
    async (parts: Blob[], type: string) => {
      setPhase("transcribing");
      setMessage("");
      const controller = new AbortController();
      request.current = controller;
      try {
        const result = await deliverNote(
          new Blob(parts, { type }),
          maxSeconds,
          controller.signal,
          hint.current,
        );
        setTranscript(result.text);
        setPhase("done");
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(
          error instanceof DOMException && error.name === "EncodingError"
            ? "The recording could not be read."
            : (error as Error).message,
        );
        setPhase("error");
      } finally {
        if (request.current === controller) request.current = undefined;
      }
    },
    [maxSeconds],
  );

  /** Stops the microphone; `keep` sends the note to the transcriber. */
  const stop = useCallback(
    (keep = true) => {
      const open = session.current;
      if (!open) return;
      open.keep = keep;
      if (open.recorder.state !== "inactive") open.recorder.stop();
      else release();
    },
    [release],
  );

  const start = useCallback(async () => {
    if (session.current || request.current) return;
    setMessage("");
    setTranscript("");
    setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage("This browser cannot record audio here.");
      setPhase("error");
      return;
    }
    setPhase("starting");
    const mine = ++attempt.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (error) {
      if (mine !== attempt.current) return;
      setMessage(microphoneMessage(error));
      setPhase("error");
      return;
    }
    if (mine !== attempt.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    let capture: Capture;
    try {
      capture = openCapture(stream);
    } catch {
      setMessage("The microphone could not start recording.");
      setPhase("error");
      return;
    }
    // Only a recording that is running prewarms, so a failed start leaves
    // no worker to cancel.
    prewarmVoice();
    const { context, analyser, recorder } = capture;
    const block = new Float32Array(analyser.fftSize);
    const began = performance.now();
    const open: Session = {
      stream,
      context,
      recorder,
      parts: [],
      keep: true,
      meter: window.setInterval(() => {
        analyser.getFloatTimeDomainData(block);
        const { rms, peak } = measure(block);
        pushLevel(levels.current, ledLevel(rms, peak));
        setSeconds(Math.floor((performance.now() - began) / 1000));
      }, 1000 / METER_HZ),
      limit: window.setTimeout(() => stop(true), maxSeconds * 1000),
    };
    session.current = open;
    recorder.ondataavailable = (event) => {
      if (event.data.size) open.parts.push(event.data);
    };
    recorder.onstop = () => {
      release();
      if (open.keep && open.parts.length)
        void finish(open.parts, recorder.mimeType);
      else setPhase("idle");
    };
    setPhase("recording");
  }, [finish, maxSeconds, release, stop]);

  /** Drops whatever is in flight: a recording or a transcription. */
  const cancel = useCallback(() => {
    attempt.current++;
    // A recording or a note on its way prewarmed a worker: let it go, once
    // (a discarded session is no longer kept while its recorder stops). A
    // transcription that already took the worker is stopped by the abort.
    if (session.current?.keep || request.current) cancelPrewarm();
    request.current?.abort();
    request.current = undefined;
    stop(false);
    setPhase((current) =>
      current === "transcribing" || current === "starting" ? "idle" : current,
    );
  }, [stop]);

  useEffect(() => cancel, [cancel]);
  // Closing the tab mid-recording: the keepalive cancel still reaches the
  // server, so no worker is left loading the model.
  useEffect(() => onPageHide(window, cancel), [cancel]);

  return {
    phase,
    message,
    transcript,
    setTranscript,
    seconds,
    levels,
    start,
    stop,
    cancel,
  };
}

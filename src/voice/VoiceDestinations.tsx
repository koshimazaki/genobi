import { useEffect, useRef, useState } from "react";
import { useShell } from "../studio/ShellContext";
import { studioStore } from "../studio/store";
import { runnerName } from "./agent-client";
import { isAgentActive } from "../../shared/agent-session-events";
import { copiedText, copyText, sendToGenobi } from "../agent/send";
import { useLatestAgentSession } from "../agent/useAgentSession";
import {
  fillPrompt,
  focusGenerate,
  isComposerPrompt,
  promptById,
  promptLabel,
  promptTarget,
  readsAsCameraRequest,
} from "./prompt-target";
import {
  fillWorldPrompt,
  worldPromptOpen,
  WORLD_PROMPT_ID,
  WORLD_PROMPT_LABEL,
} from "./world-prompt-target";
import { applyVoiceIntent } from "./voice-intent-target";
import {
  deliverTranscript,
  liveSession,
  NO_PROMPT,
  panelActions,
  sendToSession,
  sessionNote,
  type Routed,
} from "./session-message";

type Outcome =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "started"; text: string; sent: string }
  | { kind: "refused"; text: string };

const NOTHING_RUNS = "Nothing runs until you press Generate.";
const HELD =
  "A session is working on this project, so the project prompt is left as it is. Send to agent hands it these words.";

/**
 * Sends the transcript where it is meant (issue #23, Box 1.8), once, as it
 * arrives (`deliverTranscript`):
 * 1. A generation request ("an image with FLUX of a penguin") opens Camera,
 *    selects the mode and model and writes the subject into the prompt.
 * 2. Otherwise a running agent session (the bubble's) takes it as the
 *    person's next message, and the bubble shows it.
 * 3. Otherwise a prompt on screen takes the transcript, as typing would;
 *    the Director's project prompt is not filled while a session runs, as it
 *    is part of the project copy the agent is changing.
 * 4. With none of these, it says so and offers a session.
 * Nothing is submitted: a composer prompt ends on the priced Generate button,
 * focused, and a session's paid steps wait for approval. "To prompt" puts
 * words a session took into the prompt instead; "Send to agent instead"
 * goes the other way (or starts a session), and "Copy" puts them on the
 * clipboard, so a transcript routed the wrong way is never lost. A corrected
 * transcript goes again only through "Update prompt", "Try again" or "Send
 * correction" (a request is read again only then, never per keystroke).
 */
export function VoiceDestinations({
  transcript,
  onChange,
  onHandoff,
}: {
  transcript: string;
  onChange: (text: string) => void;
  /** Focus left the overlay for this element (Generate or its prompt). */
  onHandoff: (element: HTMLElement) => void;
}) {
  const shell = useShell();
  const shellRef = useRef(shell);
  shellRef.current = shell;
  const [routed, setRouted] = useState<Routed>();
  const [sending, setSending] = useState(false);
  const handoff = useRef(onHandoff);
  handoff.current = onHandoff;

  /** A Camera request, unless a Scroll or World Builder prompt is in use. */
  function intent(words: string): Routed | undefined {
    if (!readsAsCameraRequest(promptTarget(), worldPromptOpen()))
      return undefined;
    // A parser fault falls through to a plain fill (applyVoiceIntent).
    const applied = applyVoiceIntent(words, shellRef.current);
    if (!applied) return undefined;
    focusGenerate(undefined, handoff.current);
    return {
      kind: "intent",
      words,
      text: `Camera: ${applied.label}, prompt “${applied.subject}”. ${NOTHING_RUNS}`,
    };
  }
  /** The prompt on screen (or, for an update, the same prompt as before). */
  function prompt(words: string, same?: string): Routed {
    const target = (same && promptById(same)) || promptTarget();
    // Filling it would push the project copy over the agent's revision.
    if (target?.id === "project-prompt-text" && liveSession())
      return { kind: "held", words, text: HELD };
    const field = fillPrompt(words, target);
    // World Builder open with its Scene panel closed: its session takes it.
    if (!field)
      return fillWorldPrompt(words)
        ? {
            kind: "filled",
            words,
            field: WORLD_PROMPT_ID,
            text: `In the ${WORLD_PROMPT_LABEL}.`,
          }
        : { kind: "none", words };
    // The composer ends on Generate; the Director's prompt keeps focus where it was.
    if (isComposerPrompt(field)) focusGenerate(field, handoff.current);
    return {
      kind: "filled",
      words,
      field: field.id,
      text: `In the ${promptLabel(field)}.${isComposerPrompt(field) ? ` ${NOTHING_RUNS}` : ""}`,
    };
  }
  /** Routes the words afresh; `toPrompt` leaves any running session out. */
  async function deliver(words: string, toPrompt = false) {
    setSending(true);
    try {
      setRouted(
        await deliverTranscript(
          words,
          {
            intent,
            live: liveSession,
            send: (session, said) => sendToSession(session, said),
            prompt: (said) => prompt(said),
          },
          toPrompt,
        ),
      );
    } finally {
      setSending(false);
    }
  }
  // Once per transcript: a remount in development must not route it twice.
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void deliver(transcript.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routed once, on arrival
  }, []);

  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const text = transcript.trim();
  const busy = outcome.kind === "busy" || sending;
  // One session per transcript: editing it allows another.
  const sent = outcome.kind === "started" && outcome.sent === text;

  /**
   * "Update prompt": the corrected words, to the same place. "Try again"
   * (nothing was placed): the corrected words, routed afresh. "Send
   * correction": the corrected words to the session as another message.
   */
  function update() {
    if (!routed || busy) return;
    if (routed.kind === "session") return void sendCorrection();
    if (routed.kind === "filled") setRouted(prompt(text, routed.field));
    // A corrected Camera request is read again, as before; never a session.
    else if (routed.kind === "intent") setRouted(intent(text) ?? prompt(text));
    else void deliver(text);
  }
  async function sendCorrection() {
    const session = liveSession();
    if (!session)
      return setRouted({
        kind: "none",
        words: routed!.words,
        text: "That session is no longer running. Use To prompt or Send to agent.",
      });
    setSending(true);
    const answer = await sendToSession(session, text);
    setSending(false);
    setRouted(
      answer.ok
        ? {
            kind: "session",
            words: text,
            session: session.id,
            text: sessionNote(session, answer.pending),
          }
        : { ...routed!, text: `The session did not take it: ${answer.error}` },
    );
  }

  /**
   * The words go to the running session as its next message, or start one
   * when none runs: the same "Spawn agent" action as the bubble's picks a
   * harness, signs it in and starts it on the open project
   * (`spawn-store.ts`, through `sendToGenobi`). A session that takes no
   * message gets the words on the clipboard instead, and the panel says so.
   */
  async function send() {
    if (busy || sent || !text) return;
    setOutcome({ kind: "busy" });
    const project = !!studioStore.getState().director.bundle;
    try {
      const result = await sendToGenobi({ prompt: text, source: "voice" });
      if (result.kind === "closed") return setOutcome({ kind: "idle" });
      setOutcome({
        kind: "started",
        sent: text,
        text:
          result.kind === "sent"
            ? `Sent to the running ${runnerName(result.session.runner)} session.`
            : result.kind === "copied"
              ? copiedText(result.copied)
              : `Session started with ${runnerName(result.session.runner)}${project ? " on the open project" : ""}.`,
      });
    } catch (error) {
      setOutcome({ kind: "refused", text: (error as Error).message });
    }
  }

  /** "Copy": the transcript on the clipboard, for use by hand. */
  const [copied, setCopied] = useState<string>();
  // An edited transcript has not been copied yet.
  useEffect(() => setCopied(undefined), [text]);
  async function copy() {
    setCopied(
      (await copyText(text))
        ? "Copied to the clipboard."
        : "The clipboard could not be written. Select the transcript and copy it.",
    );
  }

  const latest = useLatestAgentSession();
  const running = !!latest && isAgentActive(latest.status);
  const inSession = routed?.kind === "session";
  const corrected = !!routed && !!text && routed.words !== text;
  const actions = routed && panelActions(routed, corrected, running);
  const placed = actions?.placed;
  return (
    <div className="voice-transcript">
      <label htmlFor="voice-transcript">Transcript</label>
      <textarea
        id="voice-transcript"
        rows={3}
        maxLength={12000}
        value={transcript}
        onChange={(event) => onChange(event.target.value)}
      />
      {(routed || sending) && (
        <p className="voice-note voice-routed" role="status">
          {routed ? (routed.text ?? NO_PROMPT) : "Sending to your session…"}
        </p>
      )}
      {actions && (
        <div className="voice-actions">
          {actions.update && (
            <button
              className="voice-use"
              aria-disabled={busy || undefined}
              onClick={update}
            >
              {actions.update}
            </button>
          )}
          {inSession ? (
            <button
              className="voice-project"
              aria-disabled={busy || undefined}
              disabled={!text}
              title="Put these words in the prompt on screen instead"
              onClick={() => !busy && void deliver(text, true)}
            >
              {actions.other}
            </button>
          ) : (
            <button
              className={placed ? "voice-project" : "voice-use"}
              aria-disabled={busy || sent || undefined}
              aria-describedby="voice-session-note"
              disabled={!text}
              title="What you want to do: a local agent session works on the project"
              onClick={() => void send()}
            >
              {actions.other}
            </button>
          )}
          <button
            className="voice-project"
            disabled={!text}
            title="Put the transcript on the clipboard, to use by hand"
            onClick={() => void copy()}
          >
            Copy
          </button>
        </div>
      )}
      {copied && (
        <p className="voice-note" role="status">
          {copied}
        </p>
      )}
      <p id="voice-session-note" className="voice-note" role="status">
        {outcome.kind === "busy"
          ? running
            ? "Sending to the session…"
            : "Starting a session…"
          : outcome.kind === "started"
            ? outcome.text
            : ""}
      </p>
      {outcome.kind === "refused" && (
        <p className="voice-note" role="alert">
          {outcome.text}
        </p>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useShell } from "../studio/ShellContext";
import { copiedText, copyText } from "../agent/send";
import { runnerName } from "./agent-client";
import { sendVoiceToAgent, voiceProjectId } from "./agent-destination";
import {
  rememberVoiceAgent,
  beginVoiceDelivery,
  endVoiceDelivery,
  useVoiceRouting,
  type VoiceRouting,
} from "./destination-store";
import {
  fillPrompt,
  focusGenerate,
  isComposerPrompt,
  promptById,
  promptLabel,
  promptName,
  promptScope,
  promptTarget,
} from "./prompt-target";
import {
  fillWorldPrompt,
  WORLD_PROMPT_ID,
  WORLD_PROMPT_LABEL,
} from "./world-prompt-target";
import { applyVoiceIntent } from "./voice-intent-target";
import { liveSession, type Routed } from "./session-message";

type Delivery = { result: Routed; routing: VoiceRouting; projectId?: string };
const NOTHING_RUNS = "Nothing runs until you press Generate.";

/** One destination per note. A preference change never resends an old transcript. */
export function VoiceDestinations({
  transcript,
  onChange,
  onHandoff,
  routing,
  projectId,
  onBusyChange,
}: {
  transcript: string;
  onChange: (text: string) => void;
  onHandoff: (element: HTMLElement) => void;
  routing: VoiceRouting;
  projectId?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const shell = useShell();
  const selected = useVoiceRouting();
  const [delivery, setDelivery] = useState<Delivery>();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string>();
  const inFlight = useRef(false);
  const once = useRef(false);
  const mounted = useRef(true);
  const text = transcript.trim();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => setCopied(undefined), [text]);

  function prompt(words: string, fieldId?: string, scope?: string): Routed {
    const target = fieldId ? promptById(fieldId) : promptTarget();
    if (scope !== undefined && (!target || promptScope(target) !== scope))
      return {
        kind: "none",
        words,
        text: "The selected prompt belongs to a different document or item now. Choose a destination before sending the correction.",
      };
    if (target?.id === "project-prompt-text" && liveSession())
      return {
        kind: "held",
        words,
        text: "An agent is working on this project. Send these words to the agent instead of overwriting its project prompt.",
      };
    if (fieldId && !target && fieldId !== WORLD_PROMPT_ID)
      return {
        kind: "none",
        words,
        text: `${promptName(fieldId)} is no longer open. Choose a prompt destination before sending.`,
      };
    const field = target ? fillPrompt(words, target) : undefined;
    if (!field) {
      const world =
        (!fieldId || fieldId === WORLD_PROMPT_ID) && fillWorldPrompt(words);
      return world
        ? {
            kind: "filled",
            words,
            field: WORLD_PROMPT_ID,
            text: `In the ${WORLD_PROMPT_LABEL}.`,
          }
        : {
            kind: "none",
            words,
            text: "No editable prompt is open at that destination. The transcript is kept here.",
          };
    }
    if (isComposerPrompt(field)) focusGenerate(field, onHandoff);
    return {
      kind: "filled",
      words,
      field: field.id,
      scope: promptScope(field),
      text: `In the ${promptLabel(field)}.${isComposerPrompt(field) ? ` ${NOTHING_RUNS}` : ""}`,
    };
  }

  async function deliver(
    words: string,
    destination: VoiceRouting,
    project: string | undefined,
    scope?: string,
  ) {
    if (inFlight.current || !words || !beginVoiceDelivery()) return;
    inFlight.current = true;
    setSending(true);
    onBusyChange?.(true);
    let accepted = destination;
    let result: Routed;
    try {
      if (voiceProjectId() !== project)
        throw new Error(
          "The open project changed. Choose a destination and send the transcript again.",
        );
      if (destination.destination === "agent") {
        const sent = await sendVoiceToAgent(words, project, destination.agent);
        if (sent.kind === "closed") {
          result = {
            kind: "none",
            words,
            text: "Agent setup was closed. Your transcript is kept here.",
          };
        } else if (sent.kind === "copied") {
          result = { kind: "none", words, text: copiedText(sent.copied) };
        } else {
          const agent = { session: sent.session, projectId: project };
          accepted = { destination: "agent", agent };
          rememberVoiceAgent(agent, destination);
          result = {
            kind: "session",
            words,
            session: sent.session.id,
            text: `${sent.kind === "started" ? "Started" : "Sent to"} ${runnerName(sent.session.runner)}.${sent.session.exchange?.at(-1)?.pending ? " Your message waits for the agent's next Genobi step." : ""} Paid steps still wait for your approval.`,
          };
        }
      } else if (destination.destination === "camera") {
        const applied = applyVoiceIntent(words, shell);
        if (applied) focusGenerate(undefined, onHandoff);
        result = applied
          ? {
              kind: "intent",
              words,
              text: `Camera: ${applied.label}, prompt “${applied.subject}”. ${NOTHING_RUNS}`,
            }
          : {
              kind: "none",
              words,
              text: "No Camera request was recognised. Choose Agent or a prompt to use these words directly.",
            };
      } else
        result = prompt(
          words,
          destination.destination === "prompt"
            ? undefined
            : destination.destination.slice(7),
          scope,
        );
    } catch (error) {
      result = { kind: "none", words, text: (error as Error).message };
    } finally {
      inFlight.current = false;
      endVoiceDelivery();
      onBusyChange?.(false);
      if (mounted.current) setSending(false);
    }
    if (mounted.current)
      setDelivery({ result, routing: accepted, projectId: project });
  }

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void deliver(transcript.trim(), routing, projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exactly once when a note arrives
  }, []);

  const routed = delivery?.result;
  const corrected = !!routed && !!text && routed.words !== text;
  const placed = routed && !["none", "held"].includes(routed.kind);
  // New notes inherit the selection. Re-sending an existing note is explicit.
  const changed =
    delivery &&
    (selected.destination !== delivery.routing.destination ||
      (selected.destination === "agent" &&
        selected.agent?.session.id !== delivery.routing.agent?.session.id));
  const correction =
    routed?.kind === "session" ? "Send correction" : "Update prompt";
  function update() {
    if (!delivery || !routed || !corrected || sending) return;
    const target =
      routed.kind === "filled"
        ? { destination: `prompt:${routed.field}` as const }
        : delivery.routing;
    void deliver(
      text,
      target,
      delivery.projectId,
      routed.kind === "filled" ? routed.scope : undefined,
    );
  }

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
      <p className="voice-note voice-routed" role="status">
        {sending ? "Sending to your destination…" : routed?.text}
      </p>
      <div className="voice-actions">
        {placed && corrected && (
          <button className="voice-use" disabled={sending} onClick={update}>
            {correction}
          </button>
        )}
        {(!placed || changed) && (
          <button
            className="voice-use"
            disabled={sending || !text}
            onClick={() => void deliver(text, selected, voiceProjectId())}
          >
            Send to selected destination
          </button>
        )}
        <button
          className="voice-project"
          disabled={!text}
          onClick={() =>
            void copyText(text).then((ok) =>
              setCopied(
                ok
                  ? "Copied to the clipboard."
                  : "Select the transcript and copy it by hand.",
              ),
            )
          }
        >
          Copy
        </button>
      </div>
      {copied && (
        <p className="voice-note" role="status">
          {copied}
        </p>
      )}
    </div>
  );
}

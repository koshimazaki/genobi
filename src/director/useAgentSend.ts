import { useEffect, useState } from "react";
import type { AgentRunnerStatus } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { agentStatus } from "../agent/api";
import { sessionProject } from "../agent/spawn-store";
import { useLatestAgentSession } from "../agent/useAgentSession";
import { useStudio } from "../studio/useStudio";
import { runnerName } from "../voice/agent-client";
import { copyAvailable } from "./project-copy";
import {
  BUSY,
  NO_COPY,
  regenerate,
  STARTING,
  unsavedText,
  type RegenerateOutcome,
} from "./regenerate";

export type Note = { text: string; alert?: boolean } | undefined;

/** What Regenerate and Send to Genobi say once Send has an answer. */
export function outcomeNote(outcome: RegenerateOutcome): Note {
  if (outcome.kind === "closed") return undefined;
  if (outcome.kind === "busy") return { text: BUSY, alert: true };
  if (outcome.kind === "starting") return { text: STARTING, alert: true };
  if (outcome.kind === "unsaved")
    return { text: unsavedText(outcome.problem), alert: true };
  if (outcome.kind === "no-copy") return { text: NO_COPY, alert: true };
  const who = runnerName(outcome.session.runner);
  return {
    text:
      outcome.turn === "next"
        ? `Sent to ${who} as the next turn on this project. Its progress and any paid step to approve are in the bubble.`
        : `${who} started on this project with your instruction. Its progress and any paid step to approve are in the bubble.`,
  };
}

/**
 * What Send says it will do. The button always reads "Send to Genobi": the
 * studio is model-agnostic, so the runner set up on this server ("Claude
 * Code", "Hermes") is only named in a tooltip (`runner`). With none set up,
 * the hint says Send sets one up first (`spawnFromStudio` walks the person
 * through choosing and signing in, then sends).
 */
export const SEND_LABEL = "Send to Genobi";
export function sendLabel(status: AgentRunnerStatus | undefined): {
  button: string;
  hint?: string;
  runner?: string;
} {
  // Not read yet: no claim either way.
  if (!status) return { button: SEND_LABEL };
  if (status.available && status.runner)
    return { button: SEND_LABEL, runner: runnerName(status.runner) };
  return {
    button: SEND_LABEL,
    hint: "No agent is set up yet. Send walks you through choosing and signing one in, then sends this without retyping.",
  };
}

/**
 * The state both agent actions share (Regenerate's popover, the Global
 * prompt's and the clip inspector's Send to Genobi): whether this studio keeps a copy, which agent
 * Send reaches, whether a session started on this project is still
 * working (the buttons show Camera's moving edge then), and one Send.
 */
export function useAgentSend() {
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<Note>();
  /** False on a studio that keeps no project copy (the hosted one). */
  const [copy, setCopy] = useState<boolean>();
  const [status, setStatus] = useState<AgentRunnerStatus>();
  useEffect(() => {
    let live = true;
    void copyAvailable().then((ok) => live && setCopy(ok));
    void agentStatus().then(
      (answer) => live && setStatus(answer),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  const session = useLatestAgentSession();
  const projectId = useStudio((s) => s.director.bundle?.project.id);
  const working =
    !!session &&
    isAgentActive(session.status) &&
    !!projectId &&
    sessionProject(session.id) === projectId;

  /** Resolves true when the instruction went to the agent. */
  async function send(instruction: string) {
    if (sending || !instruction.trim()) return false;
    setSending(true);
    setNote(undefined);
    try {
      const outcome = await regenerate(instruction);
      setNote(outcomeNote(outcome));
      // Set up during this Send: the next one names the agent.
      if (outcome.kind === "sent")
        setStatus({ available: true, runner: outcome.session.runner });
      return outcome.kind === "sent";
    } catch (error) {
      setNote({ text: (error as Error).message, alert: true });
      return false;
    } finally {
      setSending(false);
    }
  }
  return {
    send,
    sending,
    note,
    setNote,
    copy,
    working,
    label: sendLabel(status),
  };
}

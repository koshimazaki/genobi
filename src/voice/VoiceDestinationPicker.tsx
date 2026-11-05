import { useEffect, useState } from "react";
import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { continuable, implicitConversation } from "../agent/continue";
import { useLatestAgentSession } from "../agent/useAgentSession";
import { runnerName } from "./agent-client";
import { voiceProjectId } from "./agent-destination";
import {
  isVoiceDestination,
  selectVoiceAgent,
  setVoiceDestination,
  startNewVoiceConversation,
  useVoiceRouting,
} from "./destination-store";
import { promptName, visiblePromptChoices } from "./prompt-target";
import {
  WORLD_PROMPT_ID,
  WORLD_PROMPT_LABEL,
  worldPromptOpen,
} from "./world-prompt-target";

const choices = () => {
  const fields = visiblePromptChoices();
  if (worldPromptOpen() && !fields.some(({ id }) => id === WORLD_PROMPT_ID))
    fields.push({ id: WORLD_PROMPT_ID, label: WORLD_PROMPT_LABEL });
  return fields;
};

const NEW = "agent:new";
const brief = (session: AgentSession) =>
  `${runnerName(session.runner)} · ${session.prompt.slice(0, 28)}`;

/**
 * The agent's two choices, named for what they do (issue #58): Continue the
 * conversation the next note reaches, or Start new conversation. A pinned
 * conversation that finished and cannot resume says so instead of Continue.
 */
function conversationLabel(
  conversation: AgentSession | undefined,
  pinned: boolean,
) {
  if (!conversation) return "Agent · new conversation";
  if (continuable(conversation)) return `Continue · ${brief(conversation)}`;
  return pinned
    ? `Can't continue · ${runnerName(conversation.runner)} run ended`
    : "Agent";
}

/** The choice remains visible while the transcript panel is folded. */
export function VoiceDestinationPicker({ disabled }: { disabled: boolean }) {
  const routing = useVoiceRouting();
  const latest = useLatestAgentSession();
  const [fields, setFields] = useState(choices);
  const refresh = () =>
    setFields((before) => {
      const next = choices();
      return JSON.stringify(before) === JSON.stringify(next) ? before : next;
    });
  useEffect(() => {
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const pinned = routing.agent?.session;
  // The polled copy is the freshest: a pinned run may have finished since.
  const chosen = pinned && latest?.id === pinned.id ? latest : pinned;
  // Unpinned, the next note continues what it would reach: the shown
  // running session, or a finished one this project can resume.
  const implicit =
    latest && isAgentActive(latest.status)
      ? latest
      : implicitConversation(latest, voiceProjectId());
  const conversation = chosen ?? implicit;
  const fresh = routing.conversation === "new";
  const selectedField = routing.destination.startsWith("prompt:")
    ? routing.destination.slice(7)
    : undefined;
  const value =
    routing.destination === "agent" && fresh ? NEW : routing.destination;
  return (
    <label className="voice-destination">
      <span>To</span>
      <select
        aria-label="Voice destination"
        disabled={disabled}
        value={value}
        title={
          routing.destination !== "agent"
            ? undefined
            : fresh
              ? "The next note starts a new conversation with a clean context."
              : conversation && !continuable(conversation)
                ? "That run ended and cannot resume. Choose Start new conversation."
                : undefined
        }
        onFocus={refresh}
        onChange={(event) => {
          const next = event.target.value;
          if (next === NEW) startNewVoiceConversation();
          else if (next === "agent")
            selectVoiceAgent(chosen ?? undefined, voiceProjectId());
          else if (next === "agent:shown" && latest)
            selectVoiceAgent(latest, voiceProjectId());
          else if (isVoiceDestination(next)) setVoiceDestination(next);
        }}
      >
        {(!fresh || continuable(conversation)) && (
          <option value="agent">
            {conversationLabel(conversation, !!chosen)}
          </option>
        )}
        {(fresh || conversation) && (
          <option value={NEW}>Start new conversation</option>
        )}
        {latest && conversation?.id !== latest.id && (
          <option value="agent:shown">{`${continuable(latest) ? "Continue shown" : "Shown"} · ${runnerName(latest.runner)}`}</option>
        )}
        <option value="prompt">Current prompt</option>
        {fields.map(({ id, label }) => (
          <option key={id} value={`prompt:${id}`}>
            {label}
          </option>
        ))}
        {selectedField && !fields.some(({ id }) => id === selectedField) && (
          <option
            value={routing.destination}
          >{`${promptName(selectedField)} · not open`}</option>
        )}
        <option value="camera">Camera request</option>
      </select>
    </label>
  );
}

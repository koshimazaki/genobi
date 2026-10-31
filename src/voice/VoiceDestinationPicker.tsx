import { useEffect, useState } from "react";
import { useLatestAgentSession } from "../agent/useAgentSession";
import { runnerName } from "./agent-client";
import { voiceProjectId } from "./agent-destination";
import {
  isVoiceDestination,
  selectVoiceAgent,
  setVoiceDestination,
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
  const chosen = routing.agent?.session;
  const selectedField = routing.destination.startsWith("prompt:")
    ? routing.destination.slice(7)
    : undefined;
  return (
    <label className="voice-destination">
      <span>To</span>
      <select
        aria-label="Voice destination"
        disabled={disabled}
        value={routing.destination}
        onFocus={refresh}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "agent:current") selectVoiceAgent(undefined);
          else if (value === "agent:shown" && latest)
            selectVoiceAgent(latest, voiceProjectId());
          else if (isVoiceDestination(value)) setVoiceDestination(value);
        }}
      >
        <option value="agent">
          {chosen
            ? `${runnerName(chosen.runner)} · ${chosen.prompt.slice(0, 32)}`
            : "Agent"}
        </option>
        {chosen && (
          <option value="agent:current">Current agent / new session</option>
        )}
        {latest && chosen?.id !== latest.id && (
          <option value="agent:shown">{`Shown conversation · ${runnerName(latest.runner)}`}</option>
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

import { useSyncExternalStore } from "react";
import type { AgentSession } from "../../shared/agent-session";
import { sessionProject } from "../agent/spawn-store";
import { isPromptId } from "./prompt-target";

export const DESTINATION_KEY = "genobi.voice.destination";
export type VoiceDestination =
  "agent" | "prompt" | "camera" | `prompt:${string}`;
export interface VoiceAgentTarget {
  session: AgentSession;
  projectId?: string;
}
export interface VoiceRouting {
  destination: VoiceDestination;
  agent?: VoiceAgentTarget;
}
type Store = Pick<Storage, "getItem" | "setItem">;
const local = (): Store | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};
export const isVoiceDestination = (value: unknown): value is VoiceDestination =>
  value === "agent" ||
  value === "prompt" ||
  value === "camera" ||
  (typeof value === "string" &&
    value.startsWith("prompt:") &&
    isPromptId(value.slice(7)));

/** Only the routing preference is durable. Session/project identities stay in memory. */
export function readVoiceDestination(store = local()): VoiceDestination {
  try {
    const value = store?.getItem(DESTINATION_KEY);
    return isVoiceDestination(value) ? value : "agent";
  } catch {
    return "agent";
  }
}
let current: VoiceRouting | undefined;
const listeners = new Set<() => void>();
export const voiceRouting = (): VoiceRouting =>
  (current ??= { destination: readVoiceDestination() });
const publish = (next: VoiceRouting) => {
  current = next;
  listeners.forEach((listener) => listener());
};
export function setVoiceDestination(destination: VoiceDestination) {
  if (!isVoiceDestination(destination)) return;
  publish({ ...voiceRouting(), destination });
  try {
    local()?.setItem(DESTINATION_KEY, destination);
  } catch {
    // This page still remembers the choice when browser storage is unavailable.
  }
}
export function selectVoiceAgent(session?: AgentSession, projectId?: string) {
  publish({
    destination: "agent",
    ...(session
      ? {
          agent: {
            session,
            projectId: sessionProject(session.id) ?? projectId,
          },
        }
      : {}),
  });
  setVoiceDestination("agent");
}
export function rememberVoiceAgent(
  target: VoiceAgentTarget,
  expected: VoiceRouting,
) {
  // A result arriving after an explicit re-selection cannot change the destination.
  if (voiceRouting() === expected) publish({ ...expected, agent: target });
}
export const useVoiceRouting = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    voiceRouting,
    voiceRouting,
  );

export const OPEN_AGENT_VOICE = "genobi:agent-voice";

// Closing/reopening the overlay must not start a second note while the first
// is still choosing a harness or waiting for an acknowledgement.
let deliveryPending = false;
export const voiceDeliveryPending = () => deliveryPending;
export const useVoiceDeliveryPending = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    voiceDeliveryPending,
    voiceDeliveryPending,
  );
export function beginVoiceDelivery() {
  if (deliveryPending) return false;
  deliveryPending = true;
  listeners.forEach((listener) => listener());
  return true;
}
export function endVoiceDelivery() {
  deliveryPending = false;
  listeners.forEach((listener) => listener());
}

/** One shared recorder; a conversation's mic chooses that conversation explicitly. */
export function openAgentVoice(session?: AgentSession, projectId?: string) {
  selectVoiceAgent(session, projectId);
  window.dispatchEvent(new Event(OPEN_AGENT_VOICE));
}

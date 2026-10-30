import { useSyncExternalStore } from "react";
import type { SupervisorActor } from "../../shared/supervisor";

type Presence = {
  actors: SupervisorActor[];
  connected: boolean;
  connecting?: boolean;
  origin?: string;
};
let presence: Presence = { actors: [], connected: false };
const listeners = new Set<() => void>();
export function publishSupervisor(next: Presence) {
  presence = next;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useSupervisor() {
  return useSyncExternalStore(
    subscribe,
    () => presence,
    () => presence,
  );
}
export const OPEN_DEVELOPMENT = "genobi.open-development";

import { useCallback, useEffect, useState } from "react";
import { request } from "./useJobs";
import {
  keySlots,
  keysRevision,
  type KeySlots,
  type KeysStatus,
} from "../shared/keys";
import { SERVER_KEYS_CHANGED } from "./setup/state";

/** Whether the server holds a key, and how many times its keys changed. */
export interface ServerKeyState {
  connected: boolean;
  /**
   * Moves on every key saved, replaced or removed, here or in another window.
   * Replacing one connected key with another leaves `connected` true, so the
   * account on screen keys its check to this and verifies the new key afresh.
   */
  connection: number;
  /** The server's slot revisions last seen (`keysRevision`); never the key. */
  revision?: string;
  /** Which slots hold a key; unknown until the server says (the hosted Worker never does). */
  slots?: KeySlots;
}

/** What the page learns from a key status: connected, and its revisions. */
export const serverKeysSeen = (status: KeysStatus) => ({
  connected: status.comfy.connected || status.bfl.connected,
  revision: keysRevision(status),
  slots: keySlots(status),
});
type Seen = ReturnType<typeof serverKeysSeen>;

export const serverKeysChanged = (
  state: ServerKeyState,
  seen: Seen,
): ServerKeyState => ({ ...seen, connection: state.connection + 1 });

/**
 * A status read rather than a save: another window may have saved, replaced
 * or removed a key. A new connection only when the connection or any slot's
 * revision differs from what the page holds.
 */
export const serverKeysRead = (
  state: ServerKeyState,
  seen: Seen,
): ServerKeyState =>
  state.connected === seen.connected && state.revision === seen.revision
    ? state
    : serverKeysChanged(state, seen);

/**
 * The local server's own key: read from `/api/health` once, then told by the
 * key dialogue each time it saves a key or reads the status. The page never
 * holds that key.
 */
export function useServerKey(setError: (message: string) => void) {
  const [state, setState] = useState<ServerKeyState>({
    connected: false,
    connection: 0,
  });
  useEffect(() => {
    request<{
      hasServerKey: boolean;
      keysRevision?: string;
      keySlots?: KeySlots;
    }>("/api/health")
      .then((health) =>
        setState((current) => ({
          ...current,
          connected: health.hasServerKey,
          revision: health.keysRevision,
          slots: health.keySlots,
        })),
      )
      .catch(() => setError("The studio connection is unavailable."));
  }, [setError]);
  /** `saved` is false for a status the dialogue only read. */
  const keysChanged = useCallback(
    (status: KeysStatus, saved = true) =>
      setState((current) =>
        (saved ? serverKeysChanged : serverKeysRead)(
          current,
          serverKeysSeen(status),
        ),
      ),
    [],
  );
  // A key saved in setup's Connect step connects the studio behind it too.
  useEffect(() => {
    const saved = (event: Event) => {
      const status = (event as CustomEvent<KeysStatus | undefined>).detail;
      if (status) keysChanged(status);
    };
    window.addEventListener(SERVER_KEYS_CHANGED, saved);
    return () => window.removeEventListener(SERVER_KEYS_CHANGED, saved);
  }, [keysChanged]);
  return {
    hasServerKey: state.connected,
    connection: state.connection,
    slots: state.slots,
    keysChanged,
  };
}

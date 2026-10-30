import type { KeyKind } from "./provider";

/**
 * What the local server tells the page about its inference keys: whether each
 * slot is set and from where, never the key. The hosted Worker has no such
 * route; its visitors hold their key in page memory.
 */
export type KeySource = "environment" | "keychain";
export interface KeySlotStatus {
  connected: boolean;
  source?: KeySource;
  /**
   * Counts this slot's saves and removals since the server started, so a page
   * can tell a key replaced in another window from the one it checked. A
   * counter held in memory, never derived from the key: no hash, no length.
   */
  revision: number;
}
export type KeysStatus = {
  /** Whether a key entered in the studio can be saved on this machine. */
  keychain: boolean;
} & Record<KeyKind, KeySlotStatus>;

/**
 * The run slots' revisions as one value: it changes whenever a key a run can
 * spend does.
 */
export const keysRevision = (status: Pick<KeysStatus, KeyKind>) =>
  `${status.comfy.revision}.${status.bfl.revision}`;

/** Which run slots hold a key: booleans only, never the key. */
export const keySlots = (status: Pick<KeysStatus, KeyKind>) => ({
  comfy: status.comfy.connected,
  bfl: status.bfl.connected,
});
export type KeySlots = ReturnType<typeof keySlots>;

/** An agent runner: found on this machine or not, and how to set it up. */
export interface AgentRunnerStatus {
  id: string;
  name: string;
  installed: boolean;
  setup: string;
}

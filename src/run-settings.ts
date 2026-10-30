import type {
  RunLocation,
  RunLocationState,
} from "../shared/comfy/run-location";
import type { SettingLane } from "./setting-lane";
import type { WorkflowCatalogue } from "../shared/comfy/workflows";

/**
 * The session's run location and workflow choices, from `/api/settings` on
 * either adapter. The hosted Worker answers fixed Cloud; anything that does
 * not look like an answer (an older server, a fixture) reads as nothing, and
 * the controls stay hidden.
 */

/** The server answered and said no (4xx): nothing changed there. */
export class SettingRefused extends Error {}
/**
 * No definite answer: the connection broke, the answer was lost or unreadable,
 * or the server failed (5xx) after it may have saved. The change may have
 * landed, so the control must read the server again before showing anything.
 */
export class SettingUnconfirmed extends Error {}

async function send<T>(
  path: string,
  body: unknown,
  valid: (value: unknown) => value is T,
  signal?: AbortSignal,
): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: "no-store",
      signal,
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    throw new SettingUnconfirmed("The studio did not answer.");
  }
  const data: unknown = await response.json().catch(() => undefined);
  if (response.status >= 400 && response.status < 500) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new SettingRefused(
      typeof message === "string" ? message : "The setting was refused.",
    );
  }
  if (!response.ok || data === undefined)
    throw new SettingUnconfirmed("The studio's answer was lost.");
  return valid(data) ? data : null;
}

/** Every settings answer carries the revision it reflects (`setting-lane.ts`). */
const hasRevision = (value: unknown) =>
  Number.isSafeInteger((value as { revision?: unknown }).revision);

const isLocation = (value: unknown): value is RunLocationState =>
  !!value &&
  typeof value === "object" &&
  hasRevision(value) &&
  typeof (value as RunLocationState).location === "string" &&
  Array.isArray((value as RunLocationState).choices) &&
  typeof (value as RunLocationState).fixed === "boolean";

const isCatalogue = (value: unknown): value is WorkflowCatalogue =>
  !!value &&
  typeof value === "object" &&
  hasRevision(value) &&
  Array.isArray((value as WorkflowCatalogue).entries) &&
  Array.isArray((value as WorkflowCatalogue).templates);

export const readRunLocation = (signal?: AbortSignal) =>
  send("/api/settings/run-location", undefined, isLocation, signal);
export const saveRunLocation = (location: RunLocation) =>
  send("/api/settings/run-location", { location }, isLocation);
export const readWorkflows = (signal?: AbortSignal) =>
  send("/api/settings/workflows", undefined, isCatalogue, signal);
export const selectWorkflow = (entry: string, template: string) =>
  send("/api/settings/workflows/selection", { entry, template }, isCatalogue);

/** What a settings control shows. `confirmed` is false while the server's value is unknown. */
export interface SettingView<T> {
  value: T | null;
  confirmed: boolean;
  saving: boolean;
  message: string;
}

export const UNCONFIRMED =
  "The change could not be confirmed, so this shows what the studio holds now.";
export const UNKNOWN =
  "The studio could not be reached to confirm this setting. Close and reopen to check it.";

/**
 * One settings control's reads and writes, through its setting's lane
 * (`src/setting-lane.ts`), so it always shows what the server will run: one
 * save at a time from this control (a choice made while saving is ignored),
 * only the newest revision applied, and a save that ends without a value
 * (refused, lost or unreadable) followed by a fresh read through the lane,
 * whose answer is what is shown.
 */
export class SettingSaver<T extends { revision: number }> {
  private busy = false;
  private stop: () => void;
  constructor(
    private readonly show: (view: Partial<SettingView<T>>) => void,
    private readonly lane: SettingLane<T>,
    /** Called as a save is sent: the person's newer choice. */
    private readonly chose: () => void = () => {},
  ) {
    this.stop = lane.watch(show);
  }

  get saving() {
    return this.busy;
  }

  /** Shows the lane's answers again (a control mounted once more). */
  attach() {
    this.stop = this.lane.watch(this.show);
  }

  /** Stops showing the lane's answers: the control has gone. */
  dispose() {
    this.stop();
  }

  async read(request: Promise<T | null>) {
    await this.lane.run("read", () => request);
  }

  /** False when another save is still in flight and this one was ignored. */
  async save(optimistic: T, write: () => Promise<T | null>): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.chose();
    // Shown here only: the store keeps the server's answers.
    this.show({ value: optimistic, saving: true, message: "" });
    try {
      const answer = await this.lane.run("write", write);
      // Answered: the lane shows the newest revision, this one or a later.
      if (answer.ok && answer.value) return true;
      const refusal =
        !answer.ok && answer.error instanceof SettingRefused
          ? answer.error.message
          : undefined;
      // The optimistic choice goes: show what the lane last applied. Its
      // fresh read of the server has answered (confirmed), failed (unknown),
      // or waits for what is still in flight (unconfirmed, and held).
      const known = this.lane.current;
      const confirmed = this.lane.confirmed === true;
      this.show({
        ...(known ? { value: known } : {}),
        confirmed,
        message:
          confirmed || this.lane.checking ? (refusal ?? UNCONFIRMED) : UNKNOWN,
      });
      return true;
    } finally {
      this.busy = false;
      this.show({ saving: false });
    }
  }
}

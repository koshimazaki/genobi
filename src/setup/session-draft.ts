import { parseSelection } from "../../shared/licensing/selection";
import { parseUsage } from "../../shared/licensing/types";
import type { HermesFields } from "./SetupHarnesses";
import type { SetupDraft } from "./state";

/**
 * Setup in progress, kept for this tab (the setup design, Box 1.7):
 * a reload in the middle of setup (the dev server re-bundling, a crash, the
 * person's own F5) comes back at the same step with the same choices. One
 * versioned `sessionStorage` key; finishing or dismissing setup clears it.
 *
 * Only the fields below are written, each checked: the choices, the usage
 * answer, voice and its folder and model, Hermes' model and provider, and
 * the step. Provider keys are never part of the draft (the key fields are
 * uncontrolled inputs whose value goes straight to the server), and anything
 * else on the draft object is dropped rather than stored.
 */
export const SETUP_SESSION_KEY = "genobi-setup-draft-v1";
const VERSION = 1;
const TEXT_MAX = 1024;
const NAME_MAX = 200;

export interface SetupSession {
  step: number;
  draft: SetupDraft;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function tabStorage(): Store | undefined {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
}

const text = (value: unknown, max = TEXT_MAX) =>
  typeof value === "string" && value.length <= max ? value : undefined;
const guarded = <T>(read: () => T) => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

function hermesOf(value: unknown): HermesFields | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { model, provider } = value as Record<string, unknown>;
  const m = text(model, NAME_MAX);
  const p = text(provider, NAME_MAX);
  return m === undefined || p === undefined
    ? undefined
    : { model: m, provider: p };
}

/** The draft reduced to what may be stored: named fields, each checked. */
function storedDraft(value: Partial<SetupDraft>): SetupDraft {
  const usage = value.usage && guarded(() => parseUsage(value.usage));
  const folder = text(value.voiceFolder);
  const model =
    value.voiceModel === null ? null : text(value.voiceModel, TEXT_MAX);
  const hermes = hermesOf(value.hermes);
  return {
    selection: guarded(() => parseSelection(value.selection ?? {})) ?? {},
    ...(usage ? { usage } : {}),
    ...(typeof value.voice === "boolean" ? { voice: value.voice } : {}),
    ...(folder !== undefined ? { voiceFolder: folder } : {}),
    ...(model !== undefined ? { voiceModel: model } : {}),
    ...(hermes ? { hermes } : {}),
  };
}

/** The JSON written for a session; exported so a test can read it. */
export const sessionJson = ({ step, draft }: SetupSession) =>
  JSON.stringify({ version: VERSION, step, draft: storedDraft(draft) });

/** Keeps setup's step and draft for this tab; storage refused is ignored. */
export function keepSetupSession(
  session: SetupSession,
  storage: Store | undefined = tabStorage(),
) {
  try {
    storage?.setItem(SETUP_SESSION_KEY, sessionJson(session));
  } catch {
    /* Without storage a reload starts setup again, as before. */
  }
}

/**
 * The setup this tab was in before a reload, or undefined. A record from
 * another version, or one that does not parse, is ignored and removed.
 */
export function restoreSetupSession(
  lastStep: number,
  storage: Store | undefined = tabStorage(),
): SetupSession | undefined {
  const raw = guarded(() => storage?.getItem(SETUP_SESSION_KEY));
  if (!raw) return undefined;
  const value = guarded(() => JSON.parse(raw) as Record<string, unknown>);
  const step = value?.step;
  if (
    !value ||
    value.version !== VERSION ||
    !Number.isInteger(step) ||
    (step as number) < 0 ||
    (step as number) > lastStep ||
    !value.draft ||
    typeof value.draft !== "object"
  ) {
    clearSetupSession(storage);
    return undefined;
  }
  return {
    step: step as number,
    draft: storedDraft(value.draft as Partial<SetupDraft>),
  };
}

/** Setup finished or was dismissed on purpose: nothing comes back. */
export function clearSetupSession(storage: Store | undefined = tabStorage()) {
  try {
    storage?.removeItem(SETUP_SESSION_KEY);
  } catch {
    /* Nothing was kept. */
  }
}

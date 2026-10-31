import { timingSafeEqual } from "node:crypto";
import { AppError, requireKey } from "./errors";
import type { Keychain } from "./keychain";
import type { WorkflowSettings } from "./workflow-settings";
import { entryFor } from "../shared/registry";
import type { GenerateInput } from "../shared/types";
import type { StoredJob } from "./store";
import {
  chooseKey,
  keyKind,
  missingKeyError,
  type KeyKind,
  type ProviderChoice,
} from "../shared/provider";
import {
  isTerminal,
  type Generator,
  type KeyMode,
  type VideoModel,
} from "../shared/types";
import type { KeySlotStatus, KeysStatus } from "../shared/keys";
import type { BudgetPayer } from "../shared/budget";
import { SlotLock } from "./slot-lock";
import {
  isRetiredLocation,
  RETIRED_LOCATION_MESSAGE,
} from "../shared/comfy/destination";

/** The slots the local server holds; `chooseKey` picks between them. */
export const KEY_KINDS: readonly KeyKind[] = ["comfy", "bfl"];
const VARIABLE: Record<KeyKind, string> = {
  comfy: "COMFY_API_KEY",
  bfl: "BFL_API_KEY",
};

/**
 * A key for a slot: the general key rules (8 to 512 characters, no space or
 * control character), a plain charset, and the slot's prefix.
 */
export function requireSlotKey(kind: KeyKind, value: unknown): string {
  const key = requireKey(value);
  if (!/^[A-Za-z0-9._~+/=:-]+$/.test(key))
    throw new AppError(400, "That key has characters no API key uses.");
  if (keyKind(key) !== kind)
    throw new AppError(
      400,
      kind === "comfy"
        ? "A Comfy key starts with comfyui-."
        : "That is a Comfy key. Put it in the Comfy slot.",
      "invalid_key",
    );
  return key;
}

/**
 * The local server's own keys: one Comfy key for all generation and an
 * optional BFL key for what Comfy cannot run yet. An environment variable
 * wins over a Keychain item, so a configured shell keeps working unchanged.
 * Nothing here is ever logged or returned to the page; `status` is all it sees.
 */
export class ServerKeys {
  private saved: Partial<Record<KeyKind, string>> = {};
  private revisions: Record<KeyKind, number> = { comfy: 0, bfl: 0 };
  private locks: Record<KeyKind, SlotLock> = {
    comfy: new SlotLock(),
    bfl: new SlotLock(),
  };
  constructor(
    private environment: Partial<Record<KeyKind, string>> = {},
    private keychain?: Keychain,
  ) {}

  /** `COMFY_API_KEY` and `BFL_API_KEY`, each in its own slot. */
  static fromEnvironment(
    variables: Record<string, string | undefined>,
    keychain?: Keychain,
  ) {
    return new ServerKeys(
      {
        comfy: variables.COMFY_API_KEY || undefined,
        bfl: variables.BFL_API_KEY || undefined,
      },
      keychain,
    );
  }

  /**
   * A run choosing its key and recording its job holds every slot shared (it
   * learns its slot only by choosing), so no key changes in between. Runs do
   * not wait for each other, and nothing here spans a provider call.
   */
  reserving<T>(work: () => Promise<T>) {
    return this.locks.comfy.shared(() => this.locks.bfl.shared(work));
  }
  /**
   * A key change holds its slot alone, from the check that no run is still
   * finishing on it through the Keychain write: a run that arrives meanwhile
   * waits, then chooses the new key; one already choosing is recorded first,
   * and the check then refuses the change.
   */
  changing<T>(kind: KeyKind, work: () => Promise<T>) {
    return this.locks[kind].exclusive(work);
  }

  /** One key, placed by its prefix: how tests and older callers configure it. */
  static single(key?: string) {
    return new ServerKeys(key ? { [keyKind(key)]: key } : {});
  }

  /** Reads the saved keys once at startup. A locked Keychain leaves them unset. */
  async load() {
    if (!this.keychain) return;
    for (const kind of KEY_KINDS)
      try {
        const key = await this.keychain.read(kind);
        if (key) this.saved[kind] = key;
      } catch {
        /* Unavailable: the slot reads as not connected. */
      }
  }

  key(kind: KeyKind) {
    return this.environment[kind] ?? this.saved[kind];
  }
  /**
   * Whether the slot holds a key, reading its Keychain item again when it
   * holds none: a read that failed at startup (a locked Keychain) leaves the
   * slot empty, and a run sent on that key cannot poll until it is read.
   * Called under the slot's lock, before a key change.
   */
  async held(kind: KeyKind) {
    if (this.key(kind)) return true;
    try {
      const key = await this.keychain?.read(kind);
      if (key) {
        this.saved[kind] = key;
        this.revisions[kind]++;
      }
    } catch {
      /* Still unavailable: the slot stays empty. */
    }
    return Boolean(this.key(kind));
  }
  /** Whether a key entered is the one the slot holds: saving it changes nothing. */
  holds(kind: KeyKind, value: unknown) {
    const held = this.key(kind);
    if (!held || typeof value !== "string") return false;
    const entered = Buffer.from(value.trim());
    const current = Buffer.from(held);
    return (
      entered.length === current.length && timingSafeEqual(entered, current)
    );
  }
  get any() {
    return KEY_KINDS.some((kind) => Boolean(this.key(kind)));
  }
  /** The key a run uses: `chooseKey` between Comfy and BFL. */
  forRun(generator: Generator, model: VideoModel, preference: ProviderChoice = "auto") {
    return chooseKey(generator, model, {
      comfy: this.key("comfy"),
      bfl: this.key("bfl"),
    }, preference);
  }
  /**
   * Whose key `forRun` picked: a key from the environment is the studio's own
   * demo key; one saved in the Keychain is the owner's, entered in the studio.
   */
  modeOf(key: string): "server" | "owner" {
    return key === this.environment.comfy || key === this.environment.bfl
      ? "server"
      : "owner";
  }
  /**
   * Who pays a recipe an agent checks, before it knows each run's slot: the
   * owner only when every key held is one they saved. An environment key in
   * either slot is the demo key, so a mixed setup reads as capped.
   */
  payer(): BudgetPayer {
    const held = KEY_KINDS.filter((kind) => this.key(kind));
    if (held.length === 0) return null;
    return held.every((kind) => !this.environment[kind]) ? "owner" : "server";
  }
  /**
   * The key a cloud job is polled with: the one the request carries for a
   * visitor's run, otherwise whatever this server's slot for its provider now
   * holds. A local ComfyUI run needs none (`isLocalRun`).
   * `finishingOn` reads the same `pollSlot`, so the two cannot disagree.
   */
  forPoll(job: StoredJob, byoKey?: string) {
    const kind = pollSlot(job);
    return kind ? this.key(kind) : byoKey;
  }

  status(): KeysStatus {
    const slot = (kind: KeyKind): KeySlotStatus => ({
      ...(this.environment[kind]
        ? { connected: true, source: "environment" as const }
        : this.saved[kind]
          ? { connected: true, source: "keychain" as const }
          : { connected: false }),
      revision: this.revisions[kind],
    });
    return {
      keychain: Boolean(this.keychain),
      comfy: slot("comfy"),
      bfl: slot("bfl"),
    };
  }

  async hasBflDashboardKey() {
    try {
      return (await this.keychain?.hasBflDashboardKey?.()) ?? false;
    } catch {
      return false;
    }
  }

  /** Server-only: never return this value in an API response. */
  async bflDashboardKey() {
    const keychain = this.requireKeychain();
    if (this.environment.bfl)
      throw new AppError(
        409,
        "BFL_API_KEY is set in the server's environment and takes precedence. Unset it to save a key here.",
        "key_from_environment",
      );
    let key: string | undefined;
    try {
      key = await keychain.readBflDashboardKey?.();
    } catch {
      throw new AppError(
        503,
        "The Keychain could not read the BFL Dashboard key. Unlock it and try again.",
        "keychain_unavailable",
      );
    }
    if (!key)
      throw new AppError(
        404,
        "No BFL Dashboard key was found in the Keychain.",
        "dashboard_key_missing",
      );
    return requireSlotKey("bfl", key);
  }

  async save(kind: KeyKind, value: unknown) {
    const keychain = this.requireKeychain();
    if (this.environment[kind])
      throw new AppError(
        409,
        `${VARIABLE[kind]} is set in the server's environment and takes precedence. Unset it to save a key here.`,
        "key_from_environment",
      );
    const key = requireSlotKey(kind, value);
    try {
      await keychain.write(kind, key);
    } catch {
      throw new AppError(
        503,
        "The Keychain could not save the key. Unlock it and try again.",
        "keychain_unavailable",
      );
    }
    this.saved[kind] = key;
    this.revisions[kind]++;
  }

  async remove(kind: KeyKind) {
    const keychain = this.requireKeychain();
    try {
      await keychain.remove(kind);
    } catch {
      throw new AppError(
        503,
        "The Keychain could not remove the key. Unlock it and try again.",
        "keychain_unavailable",
      );
    }
    delete this.saved[kind];
    this.revisions[kind]++;
  }

  private requireKeychain() {
    if (!this.keychain)
      throw new AppError(
        501,
        "Saving a key needs the macOS Keychain. Set COMFY_API_KEY (and BFL_API_KEY) in the server's environment instead.",
        "keychain_unavailable",
      );
    return this.keychain;
  }
}

/** The key a run spends and whose it is; see `runCredential`. */
export interface RunCredential {
  key: string;
  mode: KeyMode;
}

/**
 * The one place a quote and its submission decide which key pays and whose
 * it is, so they can never disagree about the demo budget: a key the request
 * carries is the visitor's (`byo`), a saved Keychain key is the owner's
 * (`owner`), and only the environment's demo key (`server`) is held to the
 * shared budget and session limit. No usable key is a 401, as before, except
 * for a run planned for the local ComfyUI, which needs none.
 */
export function runCredential(
  keys: ServerKeys,
  generator: Generator,
  model: VideoModel,
  byoKey?: string,
  /** The run's planned location, when it is a workflow run. */
  location?: string,
  preference: ProviderChoice = "auto",
): RunCredential {
  if (byoKey) {
    const entered = requireKey(byoKey);
    if (preference !== "auto" && keyKind(entered) !== preference)
      throw new AppError(400, `This run selected ${preference === "bfl" ? "BFL" : "Comfy"}, but the connected page key belongs to the other provider.`, "invalid_key");
    return { key: entered, mode: "byo" };
  }
  const held = keys.forRun(generator, model, preference);
  // A workflow run planned for the local ComfyUI needs no provider key: with
  // none sent or held it runs keyless, as the owner's (the budget never holds
  // a local run). Every other plan, Comfy Cloud included, needs its key.
  if (!held && location === "local") return { key: "", mode: "owner" };
  // No key at all: name the key this route needs, not BFL for every route.
  if (!held) {
    if (preference !== "auto")
      throw new AppError(400, `Connect a ${preference === "bfl" ? "BFL" : "Comfy"} key for the selected provider.`, "invalid_key");
    throw missingKeyError(model);
  }
  const key = requireKey(held);
  return { key, mode: keys.modeOf(key) };
}

/**
 * Whether a run would go keyless: no key held for it, and the session plans
 * it for the local ComfyUI. The chain gates read it so a local stage needs no
 * key, while a Comfy Cloud or paid stage still does.
 */
export function keylessLocal(
  keys: ServerKeys,
  settings: Pick<WorkflowSettings, "plan">,
  { generator, model }: GenerateInput,
  sessionId: string,
) {
  const entry = entryFor(generator, model ?? "flux-3");
  return (
    !keys.forRun(generator, entry.videoModel) &&
    settings.plan(sessionId, entry).location === "local"
  );
}

/**
 * The server slot a job is polled through, or none: a visitor's run is
 * polled only with the key it was sent with, and a local ComfyUI run with no
 * provider key at all, so a key change cannot strand either.
 */
export function pollSlot(job: StoredJob): KeyKind | undefined {
  return job.keyMode === "byo" || isLocalRun(job) || isRetiredRun(job)
    ? undefined
    : jobKeyKind(job);
}

/**
 * A run on the local ComfyUI: free, and no provider key reaches it, so it is
 * polled, resumed and saved without one (`JobService.poll`).
 */
export const isLocalRun = (job: StoredJob) =>
  job.take?.recipe.location === "local";

/**
 * A run an earlier build sent to a host this one has no client for
 * (`isRetiredLocation`). It holds no slot and is never polled with a key.
 */
const isRetiredRun = (job: StoredJob) =>
  isRetiredLocation(job.take?.recipe.location);

/** Closes an unfinished retired run as expired; true when it was one. */
export function closeRetired(job: StoredJob) {
  if (!isRetiredRun(job)) return false;
  job.status = "expired";
  job.error = RETIRED_LOCATION_MESSAGE;
  job.updatedAt = new Date().toISOString();
  return true;
}

/**
 * Whether an unfinished run polls through this slot. Such a run is polled
 * with whatever key the slot holds (an `owner` run, and a `server` run whose
 * environment key moved into the Keychain across a restart), and a key from
 * another account would read it as lost, so the slot cannot be replaced or
 * removed until it finishes. The old key is not kept anywhere to avoid this.
 */
export function finishingOn(jobs: readonly StoredJob[], kind: KeyKind) {
  return jobs.some((job) => !isTerminal(job.status) && pollSlot(job) === kind);
}

/**
 * The provider a job was sent to. A take records it (`bfl` for BFL direct);
 * a run recorded before takes existed is read from its generator and handle.
 */
export function jobKeyKind(job: StoredJob): KeyKind {
  if (job.take) return job.take.recipe.route === "bfl" ? "bfl" : "comfy";
  if (job.generator === "upscale") return "bfl";
  let host = "";
  try {
    host = new URL(job.pollingUrl ?? "").hostname;
  } catch {
    /* No handle: nothing was sent, so either slot reads the same. */
  }
  return host === "bfl.ai" || host.endsWith(".bfl.ai") ? "bfl" : "comfy";
}

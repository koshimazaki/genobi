/**
 * The studio's side of `spawnAgent` (spawn.ts): one dialog, mounted once
 * beside the Genobi bubble, that shows the step the action waits on (choose
 * a harness, Hermes' setup, sign-in, Terminal or bubble) and resolves it
 * from the person's click. Outside any component, so the voice panel, the
 * bubble and the Director all start the same way and share one spawn.
 */
import { useSyncExternalStore } from "react";
import type {
  AgentSession,
  AgentSessionMode,
} from "../../shared/agent-session";
import type {
  HarnessSignIn,
  HermesProfileSetupState,
  SetupRunner,
} from "../../shared/agent-runner-setting";
import { studioStore } from "../studio/store";
import {
  PromptWithheld,
  spawnAgent,
  type RunnerOffer,
  type RunnerPick,
  type SpawnRequest,
} from "./spawn";

export type SpawnStep =
  | { kind: "closed" }
  | { kind: "working"; text: string }
  | { kind: "choose"; offer: RunnerOffer }
  | { kind: "profile"; state?: HermesProfileSetupState }
  | { kind: "sign-in"; runner: SetupRunner; rows: readonly HarnessSignIn[] }
  | { kind: "mode" }
  | { kind: "failed"; text: string };

/** The person closed the dialog: no message, nothing started. */
export class SpawnCancelled extends Error {}

let step: SpawnStep = { kind: "closed" };
let answer:
  { resolve: (value: unknown) => void; reject: (e: Error) => void } | undefined;
/** Terminal is the preferred experience; "Run in the bubble instead" flips it. */
let preferTerminal = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
function show(next: SpawnStep) {
  step = next;
  emit();
}
/** Shows a step and waits for the person's answer to it. */
function ask<T>(next: SpawnStep) {
  return new Promise<T>((resolve, reject) => {
    answer = { resolve: resolve as (value: unknown) => void, reject };
    show(next);
  });
}

export const spawnStep = () => step;
export const useSpawnStep = () =>
  useSyncExternalStore(subscribe, spawnStep, spawnStep);
export const prefersTerminal = () => preferTerminal;
export const usePrefersTerminal = () =>
  useSyncExternalStore(subscribe, prefersTerminal, prefersTerminal);
export function setPrefersTerminal(value: boolean) {
  preferTerminal = value;
  emit();
}

/** The dialog's buttons. */
export const choose = (pick: RunnerPick) => answer?.resolve(pick);
export const checkedSignIn = () => answer?.resolve(undefined);
export function chooseMode(mode: AgentSessionMode) {
  setPrefersTerminal(mode === "terminal");
  answer?.resolve(mode);
}
/**
 * The dialog's ×: a question waiting is refused at once; between questions
 * the spawn stops at its next step, before anything else is saved or
 * started.
 */
export function cancelSpawn() {
  const pending = answer;
  answer = undefined;
  if (running) cancelled = true;
  show({ kind: "closed" });
  pending?.reject(new SpawnCancelled());
}
let cancelled = false;
/** Each step of a spawn the person closed ends it there. */
function proceed() {
  if (cancelled) throw new SpawnCancelled();
}

const WORKING: Record<string, string> = {
  checking: "Checking your agent…",
  saving: "Saving your agent…",
  writing: "Saving your edits for the agent…",
  starting: "Starting Genobi…",
  "terminal-sign-in": "Signing in and starting in Terminal…",
};

let running: Promise<AgentSession | undefined> | undefined;

/**
 * The project each session this page spawned was started on (its copy
 * linked when the server holds one), so Regenerate can tell the next turn
 * on a project from a new session. A session found after a reload is not here.
 */
const startedOn = new Map<string, string>();

/** A spawn is under way; a second `spawnFromStudio` would share it. */
export const spawnInFlight = () => running !== undefined;
export const sessionProject = (sessionId: string) => startedOn.get(sessionId);

/**
 * Spawns the agent from anywhere in the studio, with the open Director
 * project linked. Resolves with the session, or undefined when the person
 * closed the dialog; a refusal stays in the dialog with its reason and
 * rejects with it. One spawn at a time: a second call shares the first.
 */
export function spawnFromStudio(
  request: Omit<SpawnRequest, "projectId">,
): Promise<AgentSession | undefined> {
  if (running) return running;
  cancelled = false;
  const projectId = studioStore.getState().director.bundle?.project.id;
  running = spawnAgent(
    {
      ...request,
      projectId,
    },
    {
      phase: (phase) => {
        // Once started, the session stands; every earlier step may stop.
        if (phase === "started") return show({ kind: "closed" });
        proceed();
        if (WORKING[phase]) show({ kind: "working", text: WORKING[phase] });
        if (phase === "profile") show({ kind: "profile" });
      },
      choose: (offer) => {
        proceed();
        return ask<RunnerPick>({ kind: "choose", offer });
      },
      profile: (state) => {
        if (!cancelled) show({ kind: "profile", state });
      },
      signIn: (runner, rows) => {
        proceed();
        return ask<void>({ kind: "sign-in", runner, rows });
      },
      mode: () => {
        proceed();
        return ask<AgentSessionMode>({ kind: "mode" });
      },
      go: proceed,
    },
  )
    .then(
      (session) => {
        if (projectId) startedOn.set(session.id, projectId);
        // Closed by the person: nothing they asked for is reported as
        // started. A session the server had already begun stays in the
        // bubble, where start() showed it.
        if (cancelled) return undefined;
        return session;
      },
      (error: Error) => {
        if (error instanceof SpawnCancelled || cancelled) return undefined;
        // The caller says why itself (Regenerate's popover): no dialog.
        if (error instanceof PromptWithheld) {
          show({ kind: "closed" });
          throw error;
        }
        show({ kind: "failed", text: error.message });
        throw error;
      },
    )
    .finally(() => {
      answer = undefined;
      running = undefined;
    });
  return running;
}

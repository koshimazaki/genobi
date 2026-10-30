/**
 * The local server's setup routes for the Connect step: the harness chosen
 * for project prompts, each harness's sign-in state, and its sign-in opened in
 * Terminal. Every request carries the studio's header, which the server
 * requires (`sameOrigin`). The hosted studio has no such routes.
 */
import type {
  AgentRunnerChoice,
  AgentRunnerSettingState,
  HarnessSignIn,
  HermesProfileSetupState,
  SetupRunner,
} from "../../shared/agent-runner-setting";
import { AGENT_REQUEST_HEADER } from "../../shared/agent-session-events";
import { introVideoAddress } from "../../shared/intro-video";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    // Every read is fresh: Check again must never see a cached answer.
    cache: "no-store",
    ...init,
    headers: { [AGENT_REQUEST_HEADER]: "1", ...init.headers },
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "The local studio could not be reached.",
    );
  return body as T;
}

export const readRunnerSetting = (signal?: AbortSignal) =>
  call<AgentRunnerSettingState>("/api/settings/agent-runner", { signal });

export const saveRunnerSetting = (choice: AgentRunnerChoice) =>
  call<AgentRunnerSettingState>("/api/settings/agent-runner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(choice),
  });

/** The intro video's address, or undefined where none is set or no route. */
export const readIntroVideo = (signal?: AbortSignal) =>
  call<{ video?: unknown }>("/api/settings/intro-video", { signal }).then(
    (body) => introVideoAddress(body.video),
    () => undefined,
  );

export const readSignIn = (signal?: AbortSignal) =>
  call<{ harnesses?: unknown }>("/api/agent/sign-in", { signal }).then(
    (body) =>
      (Array.isArray(body.harnesses) ? body.harnesses : []) as HarnessSignIn[],
  );

export const openSignIn = (runner: SetupRunner) =>
  call<{ opened: true }>(`/api/agent/sign-in/${runner}`, { method: "POST" });

/** "Set up Hermes": refused at once with the reason, or started (202). */
export const startHermesProfile = () =>
  call<HermesProfileSetupState>("/api/agent/hermes-profile", {
    method: "POST",
  });

export const readHermesProfile = (signal?: AbortSignal) =>
  call<HermesProfileSetupState>("/api/agent/hermes-profile", { signal });

/**
 * Starts the profile setup and follows it until it ends, calling `onState`
 * with each read. Resolves with the last state; a refusal rejects with the
 * server's sentence.
 */
export async function runHermesProfile(
  onState: (state: HermesProfileSetupState) => void,
  wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  let state = await startHermesProfile();
  onState(state);
  while (state.phase === "running") {
    await wait(700);
    state = await readHermesProfile();
    onState(state);
  }
  if (state.phase === "failed")
    throw new Error(state.error ?? "Hermes could not be set up.");
  return state;
}

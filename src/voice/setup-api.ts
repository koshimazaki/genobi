import { AGENT_REQUEST_HEADER } from "../../shared/agent-session-events";
import { INSTALL_PHASES, type InstallState } from "../../shared/voice-install";
import { requireLocalVoice } from "./availability";

export interface VoiceInstallState extends InstallState {
  busy: boolean;
}
/** A verified Qwen3-ASR-0.6B already on this machine. */
export interface FoundVoiceModel {
  folder: string;
  /** The folder with the home folder shown as `~`. */
  label: string;
  source: "configured" | "genobi" | "search";
}
export interface VoiceSetupInfo {
  token: string;
  model: string;
  bytes: number;
  folder: string;
  browse: boolean;
  supported: boolean;
  reason?: string;
  state: VoiceInstallState;
}
export async function setupRequest<T>(
  url = "",
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  // Bound read-only checks. Never time out/retry a mutation whose outcome may be unknown.
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  let timedOut = false;
  const timer =
    method === "GET"
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, 20_000)
      : undefined;
  try {
    // Inside the bound: a stalled hosted check times out or aborts too.
    await requireLocalVoice(controller.signal);
    const response = await fetch(`/api/voice/setup${url}`, {
      method,
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        value.error || "Voice setup is unavailable on this server.",
      );
    return value as T;
  } catch (error) {
    if (timedOut)
      throw new Error(
        "Voice setup check timed out. Check the local server and try again.",
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** A successful HTML fallback or malformed payload must not leave setup stuck. */
export async function readVoiceSetup(
  signal?: AbortSignal,
): Promise<VoiceSetupInfo> {
  const value = await setupRequest<VoiceSetupInfo>(
    "",
    "GET",
    undefined,
    signal,
  );
  if (
    !value ||
    typeof value.supported !== "boolean" ||
    typeof value.folder !== "string" ||
    typeof value.token !== "string" ||
    typeof value.model !== "string" ||
    !Number.isFinite(value.bytes) ||
    !value.state ||
    typeof value.state.busy !== "boolean" ||
    !(INSTALL_PHASES as readonly string[]).includes(value.state.phase)
  ) {
    throw new Error(
      "Voice setup returned an unreadable status. Check the local server and try again.",
    );
  }
  return value;
}

/**
 * The verified models the server found on this machine. Read only: it mints
 * nothing and installs nothing. A malformed answer reads as none found.
 */
export async function readFoundVoiceModels(
  signal?: AbortSignal,
): Promise<FoundVoiceModel[]> {
  await requireLocalVoice(signal);
  const response = await fetch("/api/voice/setup/found", {
    cache: "no-store",
    signal,
    // The route needs the studio's header (`sameOrigin`), as setup's others do.
    headers: { [AGENT_REQUEST_HEADER]: "1" },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      value.error || "Voice setup is unavailable on this server.",
    );
  return Array.isArray(value.models)
    ? value.models.filter(
        (model: Partial<FoundVoiceModel>) =>
          typeof model?.folder === "string" && typeof model.label === "string",
      )
    : [];
}

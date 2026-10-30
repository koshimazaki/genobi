import { useEffect, useState } from "react";
import { request } from "../useJobs";
import type {
  AgentRunnerStatus,
  KeySlotStatus,
  KeysStatus,
} from "../../shared/keys";
import type { KeyKind } from "../../shared/provider";

/**
 * The local server's keys and agent runners, or null on the hosted studio,
 * which has no such routes. Read once each time the dialogue opens.
 */
export function useLocalKeys() {
  const [keys, setKeys] = useState<KeysStatus | null>(null);
  const [runners, setRunners] = useState<AgentRunnerStatus[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    request<{ keys: KeysStatus }>("/api/keys", { signal })
      .then((answer) => setKeys(answer.keys))
      .catch(() => {});
    request<{ runners: AgentRunnerStatus[] }>("/api/agent/runners", { signal })
      .then((answer) =>
        setRunners(Array.isArray(answer.runners) ? answer.runners : []),
      )
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return { keys, setKeys, runners };
}

const SOURCE: Record<KeyKind, string> = {
  comfy: "COMFY_API_KEY",
  bfl: "BFL_API_KEY",
};
const describe = (kind: KeyKind, slot: KeySlotStatus) =>
  !slot.connected
    ? "Not connected"
    : slot.source === "environment"
      ? `Connected · ${SOURCE[kind]} in the server's environment`
      : "Connected · saved in your Keychain";

/**
 * One key slot. The key goes to the local server, which saves it in the
 * macOS Keychain; the page keeps nothing and only hears "connected".
 */
export function KeySlot({
  kind,
  label,
  placeholder,
  status,
  onChange,
}: {
  kind: KeyKind;
  label: string;
  placeholder: string;
  status: KeysStatus;
  onChange: (keys: KeysStatus) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dashboardAvailable, setDashboardAvailable] = useState(false);
  const slot = status[kind];
  const fromEnvironment = slot.source === "environment";
  useEffect(() => {
    if (kind !== "bfl" || !status.keychain || fromEnvironment) return;
    const controller = new AbortController();
    request<{ available: boolean }>("/api/keys/bfl/dashboard", {
      signal: controller.signal,
    })
      .then((answer) => setDashboardAvailable(answer.available === true))
      .catch(() => setDashboardAvailable(false));
    return () => controller.abort();
  }, [kind, status.keychain, fromEnvironment]);
  async function reuseDashboardKey() {
    setBusy(true);
    setError("");
    try {
      const answer = await request<{ keys: KeysStatus }>(
        "/api/keys/bfl/dashboard",
        {
          method: "PUT",
        },
      );
      onChange(answer.keys);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(method: "PUT" | "DELETE", key?: string) {
    setBusy(true);
    setError("");
    try {
      const answer = await request<{ keys: KeysStatus }>(`/api/keys/${kind}`, {
        method,
        ...(key === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key }),
            }),
      });
      onChange(answer.keys);
      return true;
    } catch (failure) {
      setError((failure as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="key-slot"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const key = new FormData(form).get("apiKey");
        if (await send("PUT", typeof key === "string" ? key.trim() : ""))
          form.reset();
      }}
    >
      <label htmlFor={`key-${kind}`}>{label}</label>
      <p className="key-slot__status" aria-live="polite">
        <span
          className={`connection-dot ${slot.connected ? "connected" : ""}`}
        />
        {describe(kind, slot)}
      </p>
      {!fromEnvironment && (
        <>
          {kind === "bfl" && dashboardAvailable && (
            <div>
              <p className="key-slot__status">
                BFL Dashboard key found. Use it here for compatible FLUX models
                and upscales; those calls will use BFL credits.
              </p>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void reuseDashboardKey()}
              >
                Use BFL Dashboard key
              </button>
            </div>
          )}
          <input
            id={`key-${kind}`}
            type="password"
            autoComplete="off"
            name="apiKey"
            placeholder={placeholder}
            maxLength={512}
            minLength={8}
            required
          />
          <div className="dialog-actions">
            <button
              type="button"
              className="text-button"
              disabled={busy || !slot.connected}
              onClick={() => void send("DELETE")}
            >
              Remove
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              {slot.connected ? "Replace key" : "Save key"}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="key-slot__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Read-only discovery; agent authentication stays in the agent's own setup. */
export function LocalAgentStatus({
  runners,
}: {
  runners: AgentRunnerStatus[];
}) {
  if (!runners.length) return null;
  return (
    <div className="key-agents">
      <p>
        Your agent signs in through its own setup. Genobi stores no agent key.
      </p>
      <ul>
        {runners.map((runner) => (
          <li key={runner.id}>
            <span
              className={`connection-dot ${runner.installed ? "connected" : ""}`}
            />
            <span>
              <strong>{runner.name}</strong>{" "}
              {runner.installed
                ? "found on this machine."
                : "not found on this machine."}{" "}
              {runner.setup}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

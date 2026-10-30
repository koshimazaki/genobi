import { useEffect, useState, useRef } from "react";
import { startAgentSession } from "../agent/api";
import { showAgentSession } from "../agent/useAgentSession";
import { AGENT_REQUEST_HEADER } from "../../shared/agent-session-events";
import { RELAY_ID, RELAY_SECRET } from "../../shared/runner-relay";
interface Status {
  paired: boolean;
  available?: boolean;
  origin?: string;
  message?: string;
}
async function send(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: {
      [AGENT_REQUEST_HEADER]: "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "Pairing request failed.");
  return value;
}
export function RunnerPairing() {
  const [hosted, setHosted] = useState<boolean>();
  const [status, setStatus] = useState<Status>();
  const [ticket, setTicket] = useState("");
  const [input, setInput] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState("");
  const pendingStart = useRef<{ id: string; prompt: string } | undefined>(
    undefined,
  );
  let pairingOrigin = "";
  try {
    pairingOrigin = new URL(JSON.parse(input).origin).origin;
  } catch {
    /* Incomplete code. */
  }
  useEffect(() => {
    let active = true;
    void send("/api/health").then(
      (v) => {
        if (active) setHosted(v.hosted === true);
      },
      () => {
        if (active)
          setMessage("Could not identify this studio. Refresh Settings.");
      },
    );
    const refresh = () =>
      void send("/api/runner/status").then(
        (v) => {
          if (active) setStatus(v);
        },
        () => {},
      );
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function act(run: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await run();
    } catch (error) {
      setMessage(
        (error as Error).message +
          (pendingStart.current
            ? " The launch may be uncertain. Keep the same prompt to recover its request; inspect the bubble or local studio before starting different work."
            : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Hosted runner pairing">
      <h3>Pair hosted and local Genobi</h3>
      <p>
        The local studio connects outward to Cloudflare. Hermes credentials stay
        on that machine. Pairing allows this hosted browser session to start
        agent inference, which may use your subscription or incur model costs.
        Session prompts and progress pass through the hosted relay.
      </p>
      <p>
        Pairing lasts 24 hours. Project files and paid approvals stay in the
        local studio.
      </p>
      {hosted === true ? (
        <>
          {status?.available && (
            <>
              <label>
                Prompt for your paired runner
                <textarea
                  value={prompt}
                  maxLength={4000}
                  rows={3}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !prompt.trim()}
                onClick={() =>
                  void act(async () => {
                    if (
                      !pendingStart.current ||
                      pendingStart.current.prompt !== prompt
                    )
                      pendingStart.current = {
                        id: crypto.randomUUID(),
                        prompt,
                      };
                    const session = await startAgentSession(
                      { prompt, source: "typed", context: { picks: [] } },
                      pendingStart.current.id,
                    );
                    showAgentSession(session);
                    pendingStart.current = undefined;
                    setMessage(
                      "Session started. Open the Genobi bubble to follow progress; paid approvals remain local.",
                    );
                  })
                }
              >
                Start paired runner
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy || status?.paired}
            onClick={() =>
              void act(async () => {
                const v = await send("/api/runner/pair", "POST");
                setTicket(
                  JSON.stringify({
                    origin: window.location.origin,
                    id: v.id,
                    code: v.code,
                  }),
                );
                setMessage(
                  "Paste this private code into Settings in your local studio within 10 minutes.",
                );
              })
            }
          >
            Create pairing code
          </button>
          {ticket && (
            <>
              <label>
                Private pairing code
                <textarea readOnly value={ticket} rows={4} />
              </label>
              <button
                type="button"
                onClick={() =>
                  void act(async () => {
                    await navigator.clipboard.writeText(ticket);
                    setMessage("Pairing code copied.");
                  })
                }
              >
                Copy pairing code
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await send("/api/runner/pair", "DELETE");
                setTicket("");
                setStatus({ paired: false });
                setMessage(
                  "Pairing revoked. An online runner receives this on its next heartbeat; loss of connection also stops paired sessions.",
                );
              })
            }
          >
            Revoke runner access
          </button>
        </>
      ) : hosted === false ? (
        <>
          {!status?.paired && (
            <>
              <label>
                Code from hosted Settings
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={4}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Allow {pairingOrigin || "the named hosted studio"} to start this
                configured local runner.
              </label>
              <button
                type="button"
                disabled={busy || !confirmed || !input.trim()}
                onClick={() =>
                  void act(async () => {
                    const v = JSON.parse(input);
                    if (
                      typeof v.id !== "string" ||
                      !RELAY_ID.test(v.id) ||
                      typeof v.code !== "string" ||
                      !RELAY_SECRET.test(v.code)
                    )
                      throw new Error(
                        "Paste the complete pairing code from the hosted studio.",
                      );
                    setStatus(
                      await send("/api/runner/connect", "POST", {
                        ...v,
                        confirmed,
                      }),
                    );
                    setInput("");
                    setConfirmed(false);
                  })
                }
              >
                Pair local runner
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                setStatus(await send("/api/runner/connect", "DELETE"));
              })
            }
          >
            Disconnect local runner
          </button>
        </>
      ) : (
        <p>Checking studio…</p>
      )}
      {status?.origin && <p>Hosted studio: {status.origin}</p>}
      {status?.message && <p role="status">{status.message}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

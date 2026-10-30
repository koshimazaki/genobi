import { useEffect, useState } from "react";
import { AGENT_REQUEST_HEADER } from "../../shared/agent-session-events";
import { reloadAfterSaving } from "../director/leave-guard";

const headers = {
  [AGENT_REQUEST_HEADER]: "1",
  "Content-Type": "application/json",
};
type ServerState = { restartable: boolean; changed: boolean };

/**
 * After a restart: wait for the old listener to close, then for the new
 * one to answer, then reload once, after the Director's project copy saved
 * what is waiting (`reloadAfterSaving`), so a saved copy reloads without
 * the browser's leave-page dialog. Gives up after 90 seconds. Returns its
 * stop.
 */
export function reloadWhenBack({
  giveUp,
  fetcher = fetch,
  reload = reloadAfterSaving,
  now = Date.now,
  every = 1000,
}: {
  giveUp: () => void;
  fetcher?: typeof fetch;
  reload?: () => Promise<void>;
  now?: () => number;
  every?: number;
}) {
  let done = false;
  const started = now();
  const finish = () => {
    done = true;
    clearInterval(timer);
  };
  const timer = setInterval(() => {
    if (done || now() - started < 1500) return;
    fetcher("/api/health", { cache: "no-store" })
      .then((response) => {
        if (!response.ok || done) return;
        finish();
        void reload();
      })
      .catch(() => {});
    if (now() - started > 90_000 && !done) {
      finish();
      giveUp();
    }
  }, every);
  return finish;
}

/**
 * Says when the local server runs older code than the checkout (an agent or
 * a pull changed `server/` or `shared/`), and restarts it through
 * `npm run dev`'s supervisor. Native terminals and paid jobs carry on; the
 * page reloads once the new server answers.
 */
export default function ServerRestart() {
  const [state, setState] = useState<ServerState>();
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (restarting) return;
    let disposed = false;
    const update = () =>
      fetch("/api/development/server", { headers })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((next: ServerState | undefined) => {
          if (!disposed) setState(next);
        })
        .catch(() => {});
    void update();
    const timer = setInterval(update, 10_000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [restarting]);
  useEffect(() => {
    if (!restarting) return;
    return reloadWhenBack({
      giveUp: () => {
        setRestarting(false);
        setError(
          "The server has not come back. Check the terminal running npm run dev.",
        );
      },
    });
  }, [restarting]);
  async function restart() {
    setError("");
    try {
      const response = await fetch("/api/development/server/restart", {
        method: "POST",
        headers,
      });
      const data = await response.json().catch(() => undefined);
      if (!response.ok)
        throw new Error(data?.error ?? "The server could not restart itself.");
      setRestarting(true);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  if (restarting)
    return (
      <p className="server-restart" role="status">
        Restarting the local server… this page reloads when it is back.
      </p>
    );
  if (!state?.changed && !error) return null;
  return (
    <div className="server-restart" role="status">
      {state?.changed && (
        <p>
          Server code changed since it started.{" "}
          {state.restartable
            ? "Restart to use it; open terminals stay, recorded jobs resume polling, and studio agent sessions stop."
            : "Restart npm run dev in its terminal to use it."}
        </p>
      )}
      {state?.changed && state.restartable && (
        <button type="button" onClick={() => void restart()}>
          Restart local server
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

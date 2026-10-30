import { useEffect } from "react";
import {
  refreshActivity,
  setActivityLogging,
  setBubbleVisibility,
  useActivity,
} from "./store";
import { OPEN_SETUP } from "../setup/state";
import "./activity.css";
export function ActivitySettings() {
  const state = useActivity();
  useEffect(() => {
    void refreshActivity();
  }, []);
  return (
    <section className="activity-settings" aria-label="Activity settings">
      <h3>Activity & display</h3>
      <label>
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) =>
            void setActivityLogging(e.target.checked).catch(() => {})
          }
        />{" "}
        Save tool activity history
      </label>
      <p>
        Off by default. Records tool names and outcomes, not prompts, arguments
        or credentials. Turning it off clears this optional history. Generation
        receipts, costs and replay protection remain.
      </p>
      <label>
        <input
          type="checkbox"
          checked={state.showBubble}
          onChange={(e) => setBubbleVisibility(e.target.checked)}
        />{" "}
        Open the Genobi bubble for session updates
      </label>
      <p>
        Off by default. You can still open Genobi manually. Closing the bubble
        never stops a run; pending approvals remain accessible.
      </p>
      {state.warning && <p role="status">{state.warning}</p>}
      {state.preferencePending && (
        <button
          type="button"
          onClick={() => void setActivityLogging(state.enabled)}
        >
          Retry saving logging preference
        </button>
      )}
      <button type="button" onClick={() => void refreshActivity()}>
        Refresh activity status
      </button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_SETUP))}
      >
        Review studio setup
      </button>
    </section>
  );
}
export function ActivityHistory() {
  const state = useActivity();
  return (
    <section aria-label="Tool activity history">
      <h3>Tools used</h3>
      {!state.enabled ? (
        <p>Optional history is off. Enable it in Settings.</p>
      ) : state.events.length ? (
        <ol>
          {state.events.slice(-20).map((e) => (
            <li key={e.id}>
              {e.tool} · {e.phase}
              {e.backend ? ` · ${e.backend}` : ""}{" "}
              <small>
                (
                {e.source === "server"
                  ? "server observed"
                  : `${e.source} reported`}
                )
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p>No recorded tool activity yet.</p>
      )}
      {state.warning && <p role="status">{state.warning}</p>}
    </section>
  );
}

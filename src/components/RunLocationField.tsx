import "../styles/deployment.css";
import { useEffect, useRef, useState } from "react";
import type {
  RunLocation,
  RunLocationState,
} from "../../shared/comfy/run-location";
import {
  readRunLocation,
  saveRunLocation,
  type SettingView,
} from "../run-settings";
import { settingSaver, useSettingSaving } from "../settings-store";

const LABEL = {
  local: "Local ComfyUI",
  cloud: "Comfy Cloud",
  both: "Both",
  deployment: "Comfy Deploy",
} as const;
const EMPTY: SettingView<RunLocationState> = {
  value: null,
  confirmed: true,
  saving: false,
  message: "",
};

/**
 * Run location: where every open workflow runs for this session, Local
 * ComfyUI or Comfy Cloud. The hosted studio is always Comfy Cloud and says so.
 * `SettingSaver` keeps it equal to the server: one save at a time, newest
 * answer only, and a fresh read after a save whose answer was lost.
 */
export default function RunLocationField() {
  const [view, setView] = useState(EMPTY);
  const [endpoint, setEndpoint] = useState("");
  const saver = useRef<ReturnType<typeof settingSaver<"run-location">>>(null);
  saver.current ??= settingSaver("run-location", (next) =>
    setView((current) => ({ ...current, ...next })),
  );
  // From the store: a save started before this control was opened holds too.
  const saving = useSettingSaving("run-location");
  useEffect(() => {
    const control = saver.current!;
    control.attach();
    const controller = new AbortController();
    void control.read(readRunLocation(controller.signal).catch(() => null));
    return () => {
      controller.abort();
      control.dispose();
    };
  }, []);
  const state = view.value;
  if (!state) return null;
  const choose = (location: RunLocation, deploymentUrl?: string) =>
    void saver.current!.save(
      {
        ...state,
        mode: location,
        location: location === "both" ? "local" : location,
      },
      () => saveRunLocation(location, deploymentUrl),
    );
  return (
    <fieldset
      className="run-location"
      disabled={state.fixed}
      aria-busy={saving}
    >
      <legend>Generation setup</legend>
      <div className="run-location__choices">
        {(["local", "cloud", "both", "deployment"] as const)
          .filter((choice) => state.choices.includes(choice))
          .map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name="run-location"
                value={choice}
                checked={
                  view.confirmed && (state.mode ?? state.location) === choice
                }
                // aria-disabled, not disabled: focus stays on the choice.
                aria-disabled={saving}
                onChange={() =>
                  choose(
                    choice,
                    choice === "deployment"
                      ? endpoint || state.deployment?.url
                      : undefined,
                  )
                }
              />
              {LABEL[choice]}
            </label>
          ))}
      </div>
      {!state.fixed && (
        <label className="deployment-endpoint">
          Comfy Deploy endpoint
          <input
            type="url"
            value={endpoint}
            placeholder={
              state.deployment?.url ?? "https://your-deployment.run.comfy.app"
            }
            onChange={(event) => setEndpoint(event.target.value)}
            disabled={saving}
          />
          <button
            type="button"
            disabled={saving || !endpoint.trim()}
            onClick={() => choose("deployment", endpoint.trim())}
          >
            Register deployment
          </button>
        </label>
      )}
      {state.deployment && (
        <a href={state.deployment.url} target="_blank" rel="noreferrer">
          Runs on your Comfy deployment {state.deployment.name}
        </a>
      )}
      <p className="run-location__note">
        Local and Both run open workflows on this machine. Comfy Cloud runs them
        online. API models use their cloud provider in every setup.
      </p>
      <p className="run-location__note" role="status">
        {saving
          ? "Saving…"
          : view.message ||
            (state.location === "local" && state.local && !state.local.reachable
              ? "No local ComfyUI answers yet. Start ComfyUI, or choose Comfy Cloud."
              : state.note)}
      </p>
    </fieldset>
  );
}

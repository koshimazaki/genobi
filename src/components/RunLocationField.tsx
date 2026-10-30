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
  const choose = (location: RunLocation) =>
    void saver.current!.save(
      {
        ...state,
        mode: location,
        location: location === "both" ? "local" : location,
      },
      () => saveRunLocation(location),
    );
  return (
    <fieldset
      className="run-location"
      disabled={state.fixed}
      aria-busy={saving}
    >
      <legend>Generation setup</legend>
      <div className="run-location__choices">
        {(["local", "cloud", "both"] as const)
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
                onChange={() => choose(choice)}
              />
              {LABEL[choice]}
            </label>
          ))}
      </div>
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

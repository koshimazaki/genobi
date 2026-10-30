import { useEffect, useRef, useState } from "react";
import type { RunLocationState } from "../../shared/comfy/run-location";
import {
  readRunLocation,
  saveRunLocation,
  type SettingView,
} from "../run-settings";
import { settingSaver, useSettingSaving } from "../settings-store";

const EMPTY: SettingView<RunLocationState> = {
  value: null,
  confirmed: true,
  saving: false,
  message: "",
};

/**
 * The model menu's Local tick: the same session run location as Studio
 * setup, through the same `SettingSaver` (one save at a time, a definite
 * refusal restores, an uncertain save reads the server again). Ticked saves
 * `both` (open workflows on the local ComfyUI, API models on their cloud
 * provider); unticked saves `cloud`. It shows ticked for Local and Both.
 * `onTicked` runs as a tick is sent: the local ComfyUI runs open workflows
 * only, so the menu turns Open only on with it.
 */
export default function LocalTick({ onTicked }: { onTicked: () => void }) {
  const [view, setView] = useState(EMPTY);
  const saver = useRef<ReturnType<typeof settingSaver<"run-location">>>(null);
  saver.current ??= settingSaver("run-location", (next) =>
    setView((current) => ({ ...current, ...next })),
  );
  const saving = useSettingSaving("run-location");
  useEffect(() => {
    // Opened with the menu: read the server, as every settings control does.
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
  const ticked = view.confirmed && state.location === "local";
  const choose = (local: boolean) => {
    if (saving || saver.current!.saving) return;
    const location = local ? "both" : "cloud";
    if (local) onTicked();
    void saver.current!.save(
      { ...state, mode: location, location: local ? "local" : "cloud" },
      () => saveRunLocation(location),
    );
  };
  return (
    <label
      title={
        state.fixed
          ? "The hosted studio runs every workflow on Comfy Cloud."
          : "Run open workflows on the ComfyUI on this machine. API models stay on their cloud provider."
      }
    >
      <input
        type="checkbox"
        checked={ticked}
        disabled={state.fixed}
        // aria-disabled, not disabled: focus stays on the tick while saving.
        aria-disabled={saving}
        aria-busy={saving}
        onChange={(event) => choose(event.target.checked)}
      />{" "}
      Local
    </label>
  );
}

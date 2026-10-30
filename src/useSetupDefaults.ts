import { useEffect } from "react";
import { entryFor } from "../shared/registry";
import { readSelection } from "./licensing/preferences";
import { SETUP_SAVED } from "./setup/state";
import { setupLocationWrite, useSettingsStore } from "./settings-store";
import type { ComposerState } from "./useComposer";

/**
 * The menu's defaults, from first-run setup's saved answers
 * (`readSelection`, `src/setup/state.ts`), never a second default:
 *
 * - Open only: on when setup chose "Open models only", the answer it
 *   preselects. With no answer yet it is on only where the opening run is
 *   already open, so the composer still describes the featured clip.
 * - Local: ticked (the session's run location written as `both`) when setup
 *   chose "Local only" and this session has not chosen a location itself.
 *
 * Applied once on load and again whenever setup is saved. Neither marks the
 * composer edited: these are defaults, not the person's edits.
 */
export function useSetupDefaults(
  state: ComposerState,
  apply: (patch: Partial<ComposerState>) => void,
) {
  const held = entryFor(state.generator, state.model);
  const heldOpen = held.open;
  useEffect(() => {
    const selection = readSelection();
    if (selection?.weights === "open-weights" || (!selection && heldOpen))
      apply({ openOnly: true });
    // On load only; a later save is the listener's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let wrote = false;
    // A session at the server's default takes setup's Local.
    const local = () => {
      const current = useSettingsStore.getState().runLocation;
      if (
        wrote ||
        readSelection()?.execution !== "local" ||
        !current ||
        current.fixed ||
        current.location === "local"
      )
        return false;
      wrote = true;
      void setupLocationWrite("both").catch(() => {});
      return true;
    };
    const stop = useSettingsStore.subscribe((s, before) => {
      if (s.runLocation && !before.runLocation) {
        if (s.runLocation.source === "server") local();
        stop();
      }
    });
    const saved = () => {
      if (readSelection()?.weights === "open-weights")
        apply({ openOnly: true });
      wrote = false;
      local();
    };
    window.addEventListener(SETUP_SAVED, saved);
    return () => {
      stop();
      window.removeEventListener(SETUP_SAVED, saved);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

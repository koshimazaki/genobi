import { useEffect, useState } from "react";
import type { BoxStatus } from "../shared/comfy/gpu-box";
import type { RunLocationState } from "../shared/comfy/run-location";

/**
 * A GPU box's status is live telemetry, not a setting: it changes when the
 * tunnel comes up or the box goes idle, while the settings revision stays the
 * same, so the revision-ordered settings lane (`src/setting-lane.ts`) would
 * drop it as a duplicate. It is read on its own route
 * (`GET /api/settings/run-location/box`, free: `/system_stats` and `/queue`)
 * and laid over the settings answer where it is shown.
 */
const REFRESH_MS = 30_000;

const isStatus = (value: unknown): value is BoxStatus =>
  !!value &&
  typeof value === "object" &&
  typeof (value as BoxStatus).reachable === "boolean" &&
  typeof (value as BoxStatus).idle === "boolean";

/** The session's box status now, or null when there is none or no answer. */
export async function readBoxStatus(
  signal?: AbortSignal,
): Promise<BoxStatus | null> {
  try {
    const response = await fetch("/api/settings/run-location/box", {
      cache: "no-store",
      signal,
    });
    if (!response.ok) return null;
    const status = ((await response.json()) as { status?: unknown })?.status;
    return isStatus(status) ? status : null;
  } catch {
    return null;
  }
}

/** The settings answer with the live box status laid over it; unchanged without one. */
export function withLiveBox(
  state: RunLocationState | undefined,
  live: BoxStatus | null,
): RunLocationState | undefined {
  if (!state?.box || !live || state.mode !== "box") return state;
  return {
    ...state,
    local: { reachable: live.reachable, version: live.version },
    box: { ...state.box, status: live },
  };
}

/**
 * The box's live status while `active` (the session runs on a box), read at
 * once and every 30 seconds; null when inactive or unread. `key` (the box's
 * port) reads again at once when the box changes.
 */
export function useLiveBoxStatus(active: boolean, key = "") {
  const [status, setStatus] = useState<BoxStatus | null>(null);
  useEffect(() => {
    if (!active) {
      setStatus(null);
      return;
    }
    const controller = new AbortController();
    const read = () =>
      void readBoxStatus(controller.signal).then((answer) => {
        if (!controller.signal.aborted && answer) setStatus(answer);
      });
    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [active, key]);
  return status;
}

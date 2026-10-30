import { useSyncExternalStore } from "react";
import {
  BROWSER_TOOLS,
  cleanActivity,
  mergeActivity,
  type ActivityEvent,
  type ActivityHistory,
} from "../../shared/activity";
const key = "genobi-activity-v1";
interface State extends ActivityHistory {
  showBubble: boolean;
  localServer?: boolean;
  preferencePending?: boolean;
}
const empty: State = { enabled: false, showBubble: false, events: [] };
function load(): State {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return {
      enabled: v?.enabled === true,
      showBubble: v?.showBubble === true,
      preferencePending: v?.preferencePending === true,
      ...(v?.preferencePending === true
        ? {
            warning:
              "Server logging has not changed yet. Retry saving this preference before relying on it.",
          }
        : {}),
      events:
        v?.enabled === true && Array.isArray(v.events)
          ? v.events.map(cleanActivity).slice(-200)
          : [],
    };
  } catch {
    return { ...empty };
  }
}
let state = load();
let preferenceVersion = 0;
let preferenceWrite = Promise.resolve();
const listeners = new Set<() => void>();
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key !== key) return;
    preferenceVersion++;
    state = { ...load(), localServer: state.localServer };
    listeners.forEach((fn) => fn());
  });
function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        enabled: state.enabled,
        showBubble: state.showBubble,
        preferencePending: state.preferencePending,
        events: state.enabled ? state.events : [],
      }),
    );
  } catch {
    state = { ...state, warning: "Activity cannot be saved in this browser." };
  }
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const useActivity = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
export const activityState = () => state;
export function setBubbleVisibility(showBubble: boolean) {
  update({ showBubble });
}
export async function refreshActivity() {
  const version = preferenceVersion;
  try {
    const response = await fetch("/api/activity", {
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) {
      update({ localServer: false });
      return;
    }
    if (!response.ok) throw new Error("Activity unavailable");
    const history = (await response.json()) as ActivityHistory;
    if (version !== preferenceVersion) return;
    if (typeof history.enabled !== "boolean" || !Array.isArray(history.events))
      throw new Error("Invalid history");
    update({
      localServer: true,
      enabled: state.preferencePending ? state.enabled : history.enabled,
      events:
        state.preferencePending && !state.enabled
          ? []
          : history.events.map(cleanActivity),
      warning: state.preferencePending ? state.warning : history.warning,
    });
  } catch {
    update({
      warning:
        "Activity history is unavailable. Existing work continues; do not repeat a completed run.",
    });
  }
}
export function setActivityLogging(enabled: boolean) {
  const version = ++preferenceVersion;
  update({
    enabled,
    ...(enabled ? {} : { events: [] }),
    warning: undefined,
    preferencePending: true,
  });
  const task = preferenceWrite.then(() => saveLogging(enabled, version));
  preferenceWrite = task;
  return task;
}
async function saveLogging(enabled: boolean, version: number) {
  if (version !== preferenceVersion) return;
  if (state.localServer === false) {
    update({ preferencePending: false });
    return;
  }
  try {
    const response = await fetch("/api/activity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
      signal: AbortSignal.timeout(10_000),
    });
    if (version !== preferenceVersion) return;
    if (response.status === 404) {
      update({ localServer: false, preferencePending: false });
      return;
    }
    if (!response.ok) throw new Error("Preference not saved");
    const history = (await response.json()) as ActivityHistory;
    if (typeof history.enabled !== "boolean" || !Array.isArray(history.events))
      throw new Error("Invalid history");
    if (version !== preferenceVersion) return;
    update({
      localServer: true,
      enabled: history.enabled,
      events: history.events.map(cleanActivity),
      warning: history.warning,
      preferencePending: false,
    });
  } catch {
    if (version !== preferenceVersion) return;
    update({
      warning:
        "Server logging has not changed yet. Retry saving this preference before relying on it.",
    });
  }
}

export async function recordBrowserActivity(
  tool: (typeof BROWSER_TOOLS)[number],
  phase: ActivityEvent["phase"],
  id: string = crypto.randomUUID(),
  backend?: ActivityEvent["backend"],
) {
  if (!state.enabled) return;
  const event: ActivityEvent = {
    id,
    at: new Date().toISOString(),
    tool,
    phase,
    source: "browser",
    ...(backend ? { backend } : {}),
  };
  update({ events: mergeActivity(state.events, event) });
  if (state.localServer === false) return;
  try {
    const response = await fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        ...(tool === "generation" && id.startsWith("job_")
          ? { jobId: id.slice(4) }
          : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) update({ localServer: false });
    else if (!response.ok) throw new Error("Activity unavailable");
  } catch {
    update({
      warning:
        "A tool event was kept in this browser only. Do not repeat the tool to recover its log.",
    });
  }
}
export async function withBrowserActivity<T>(
  tool: (typeof BROWSER_TOOLS)[number],
  run: () => Promise<T>,
) {
  const id = crypto.randomUUID();
  void recordBrowserActivity(tool, "started", id);
  try {
    const value = await run();
    void recordBrowserActivity(tool, "succeeded", id);
    return value;
  } catch (error) {
    void recordBrowserActivity(tool, "failed", id);
    throw error;
  }
}

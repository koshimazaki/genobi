import { useEffect, useSyncExternalStore } from "react";
import { readRunLocation } from "./run-settings";

let answer: Promise<boolean | undefined> | undefined;
type Detection = boolean | "pending" | "failed";
let detection: Detection = "pending";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(value: Detection) {
  detection = value;
  listeners.forEach((listener) => listener());
}

/** Shared detection: undefined on failure, so local-only clients can refuse access. */
export function readHostedStudio(): Promise<boolean | undefined> {
  answer ??= readRunLocation()
    .then(
      (state) => state?.fixed,
      () => undefined,
    )
    .then((value) => {
      publish(value ?? "failed");
      return value;
    });
  return answer;
}

/** Retry an unavailable answer; confirmed answers and in-flight reads stay shared. */
export function retryHostedStudio(): Promise<boolean | undefined> {
  if (detection === "failed") {
    answer = undefined;
    publish("pending");
  }
  return readHostedStudio();
}

/** Setup needs to distinguish a pending connection check from a failed one. */
export function useHostedStudioDetection(): Detection {
  const state = useSyncExternalStore(
    subscribe,
    () => detection,
    () => "pending" as const,
  );
  useEffect(() => {
    void readHostedStudio();
  }, []);
  return state;
}

/**
 * Whether the hosted Worker serves this page: its run location is the fixed
 * Comfy Cloud one (`HOSTED_RUN_LOCATION`), the local server's never is. Read
 * once per page unless a failed read is explicitly retried. False while pending
 * or failed, so the local studio never loses an entry to a slow read.
 */
export function useHostedStudio(): boolean {
  return useHostedStudioState() ?? false;
}

/** Undefined until confirmed, or if unavailable: local-only calls must wait. */
export function useHostedStudioState(): boolean | undefined {
  const state = useHostedStudioDetection();
  return typeof state === "boolean" ? state : undefined;
}

import { useEffect, useState } from "react";
import { readRunLocation } from "./run-settings";

let answer: Promise<boolean | undefined> | undefined;

/** Shared detection: undefined on failure, so local-only clients can refuse access. */
export function readHostedStudio(): Promise<boolean | undefined> {
  answer ??= readRunLocation().then(
    (state) => state?.fixed,
    () => undefined,
  );
  return answer;
}

/**
 * Whether the hosted Worker serves this page: its run location is the fixed
 * Comfy Cloud one (`HOSTED_RUN_LOCATION`), the local server's never is. Read
 * once per page; false until the answer comes and on any failure, so the
 * local studio never loses an entry to a slow read.
 */
export function useHostedStudio(): boolean {
  return useHostedStudioState() ?? false;
}

/** Undefined until confirmed, or if unavailable: local-only calls must wait. */
export function useHostedStudioState(): boolean | undefined {
  const [hosted, setHosted] = useState<boolean>();
  useEffect(() => {
    let live = true;
    void readHostedStudio().then((value) => {
      if (live) setHosted(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return hosted;
}

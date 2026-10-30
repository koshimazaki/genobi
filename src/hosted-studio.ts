import { useEffect, useState } from "react";
import { readRunLocation } from "./run-settings";

let answer: Promise<boolean> | undefined;

/**
 * Whether the hosted Worker serves this page: its run location is the fixed
 * Comfy Cloud one (`HOSTED_RUN_LOCATION`), the local server's never is. Read
 * once per page; false until the answer comes and on any failure, so the
 * local studio never loses an entry to a slow read.
 */
export function useHostedStudio(): boolean {
  const [hosted, setHosted] = useState(false);
  useEffect(() => {
    let live = true;
    answer ??= readRunLocation().then(
      (state) => state?.fixed === true,
      () => false,
    );
    void answer.then((value) => {
      if (live) setHosted(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return hosted;
}

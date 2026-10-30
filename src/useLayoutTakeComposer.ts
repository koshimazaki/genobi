import { useEffect, useRef } from "react";
import { layoutComposer, useLayoutTake } from "./layout-take";
import type { ComposerState } from "./useComposer";

/** An explicit scene handoff supersedes a pending Recreate like any composer edit. */
export function useLayoutTakeComposer(
  update: (patch: Partial<ComposerState>) => void,
  chosen: () => void,
) {
  const take = useLayoutTake((s) => s.pending);
  const opened = useRef("");
  useEffect(() => {
    if (!take || opened.current === take.id) return;
    opened.current = take.id;
    update(layoutComposer(take));
    chosen();
  }, [take, update, chosen]);
}

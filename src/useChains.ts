import { useEffect, useMemo, useReducer, useRef } from "react";
import { chainClient, chainController } from "./chain-client";
import { chainsReducer, emptyChains, type ChainsState } from "./chain-state";
import { useSettingsStore } from "./settings-store";
import { runsKeyless } from "./local-menu";

/** How often a running chain is read again: the jobs poller's own interval. */
const POLL_MS = 4000;

/**
 * Chains for this session: loaded once, created by Fast and the Studio review
 * step, and read again while a stage runs so the next pause gets its quote.
 * The stage jobs themselves are polled by `useJobs` like any other run, which
 * is what moves them along; `onStageStarted` hands each new one over.
 */
export function useChains(
  key: string,
  hasServerKey: boolean,
  /** Moves on every saved server key change; see `useServerKey`. */
  connection: number,
  onStageStarted: (
    jobId: string,
    show: boolean,
  ) => boolean | void | Promise<boolean | void>,
) {
  const [state, dispatch] = useReducer(chainsReducer, emptyChains);
  const keyRef = useRef(key);
  keyRef.current = key;
  const serverKey = useRef(hasServerKey);
  serverKey.current = hasServerKey;
  const started = useRef(onStageStarted);
  started.current = onStageStarted;
  const controller = useMemo(
    () =>
      chainController({
        client: chainClient(
          (input, init) => fetch(input, init),
          () => keyRef.current,
        ),
        dispatch,
        canSend: (input) =>
          Boolean(keyRef.current) ||
          serverKey.current ||
          Boolean(input && runsKeyless(input.generator, input.model)),
        onStageStarted: (jobId, show) => started.current(jobId, show),
      }),
    [],
  );
  useEffect(() => {
    void controller.load().catch(() => {
      /* History of chains is optional; the composer works without it. */
    });
    return () => controller.dispose();
  }, [controller]);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The run location and workflows as the studio applied them: a switch to
  // Local can make a paused stage keyless with no key changing at all.
  const location = useSettingsStore((s) => s.runLocation);
  const workflows = useSettingsStore((s) => s.workflows);
  const hosts = useSettingsStore((s) => s.hosts);
  useEffect(() => {
    // A pause that could not be priced without a key is priced once one
    // exists (a page key, or a key saved on the server, which moves
    // `connection` and leaves the page key empty) or once its stage is
    // planned for the local ComfyUI, which needs none.
    for (const id of priceableNow(
      stateRef.current,
      Boolean(key) || hasServerKey,
    ))
      void controller.read(id);
  }, [key, hasServerKey, connection, controller, location, workflows, hosts]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function poll() {
      if (!document.hidden)
        for (const id of stateRef.current.order) {
          const entry = stateRef.current.entries[id];
          if (entry.chain.status === "running" && !entry.busy)
            await controller.read(id);
        }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }
    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [controller]);
  return {
    state,
    ...controller,
    focus: (id: string | null) => dispatch({ type: "focus", id }),
  };
}

export type Chains = ReturnType<typeof useChains>;

/**
 * The paused chains that asked for a key and a read could now price: a key
 * exists, or the paused stage runs keyless on the local ComfyUI.
 */
export function priceableNow(state: ChainsState, hasKey: boolean) {
  return state.order.filter((id) => {
    const { needsKey, chain } = state.entries[id];
    if (!needsKey || chain.status !== "paused") return false;
    const stage = chain.stages[chain.pausedAt ?? -1];
    return (
      hasKey ||
      Boolean(stage && runsKeyless(stage.input.generator, stage.input.model))
    );
  });
}

import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "./useJobs";
import type { Balance } from "./balance-format";
import type { KeyKind } from "../shared/provider";

/** One readout: the account's last answer, or why it could not be read. */
export interface BalanceState {
  balance?: Balance;
  error?: string;
  loading: boolean;
}
type Answer = Balance | { provider: KeyKind; error: string };

export const slotId = (slot: KeyKind | undefined) => slot ?? "default";

/**
 * Both server accounts come from one `/api/credits?provider=all` read, so a
 * pair of readouts spends one `credits` allowance per check; one account is
 * read as before. Each readout still shows its own balance or error.
 */
export function readBalances(
  answers: Answer[],
  shown: (KeyKind | undefined)[],
): Record<string, BalanceState> {
  return Object.fromEntries(
    shown.map((slot) => {
      const found = answers.find((answer) => answer.provider === slot);
      const state: BalanceState = !found
        ? { error: "No key is held for this account.", loading: false }
        : "error" in found
          ? { error: found.error, loading: false }
          : { balance: found, loading: false };
      return [slotId(slot), state];
    }),
  );
}

/**
 * The balances the header shows, checked on every key change, page return,
 * settled run (`revision`) or click. Only a changed connection clears them;
 * a re-check keeps the last known amounts on screen instead of flickering.
 */
export function useBalances({
  apiKey,
  shown,
  connection,
  revision,
  refresh,
  onVerified,
}: {
  apiKey: string;
  shown: (KeyKind | undefined)[];
  connection: number;
  revision: string;
  refresh: number;
  onVerified: (verified: boolean) => void;
}) {
  const shape = shown.map(slotId).join(",");
  // Any change of key, a replaced server key included, is a new connection:
  // its accounts are unverified until `/api/credits` answers for them.
  const owner = useMemo(
    () => Symbol("connection"),
    [apiKey, shape, connection],
  );
  const [result, setResult] = useState<{
    owner?: symbol;
    states: Record<string, BalanceState>;
  }>({ states: {} });
  const [clicked, setClicked] = useState(0);
  const lastOwner = useRef<symbol | null>(null);
  useEffect(() => {
    const reconnected = lastOwner.current !== owner;
    lastOwner.current = owner;
    if (reconnected) {
      onVerified(false);
      setResult({ owner, states: {} });
    }
    const controller = new AbortController();
    const pair = shown.length > 1;
    const one = shown[0];
    const url = pair
      ? "/api/credits?provider=all"
      : one && !apiKey
        ? `/api/credits?provider=${one}`
        : "/api/credits";
    request<Balance | { balances: Answer[] }>(url, {
      headers: apiKey ? { "x-byo-key": apiKey } : {},
      signal: controller.signal,
    })
      .then((answer) => {
        if (controller.signal.aborted) return;
        const states =
          "balances" in answer
            ? readBalances(answer.balances, shown)
            : { [slotId(one)]: { balance: answer, loading: false } };
        setResult({ owner, states });
        onVerified(Object.values(states).some((state) => state.balance));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const failed = { error: (error as Error).message, loading: false };
        setResult({
          owner,
          states: Object.fromEntries(
            shown.map((slot) => [slotId(slot), failed]),
          ),
        });
      });
    return () => controller.abort();
    // `shown` is read through `shape`, its value, not its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, shape, owner, refresh, clicked, revision, onVerified]);
  const states = result.owner === owner ? result.states : {};
  return {
    state: (slot: KeyKind | undefined): BalanceState =>
      states[slotId(slot)] ?? { loading: true },
    check: () => setClicked((value) => value + 1),
  };
}

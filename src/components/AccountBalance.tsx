import { useEffect, useMemo, useState } from "react";
import type { KeySlots } from "../../shared/keys";
import type { KeyKind } from "../../shared/provider";
import { slotId, useBalances } from "../useBalances";
import BalanceReadout from "./BalanceReadout";

/**
 * The readouts the header shows: one for the visit's key; one per held slot
 * when this server holds both a Comfy and a BFL key, each labelled with its
 * own account, so neither balance stands in for the other; otherwise the
 * server's one key.
 */
export function balanceSlots(
  apiKey: string,
  slots: Partial<KeySlots> | undefined,
): (KeyKind | undefined)[] {
  if (apiKey) return [undefined];
  if (slots?.comfy && slots.bfl) return ["comfy", "bfl"];
  return [slots?.comfy ? "comfy" : slots?.bfl ? "bfl" : undefined];
}

type Props = {
  apiKey: string;
  hasServerKey: boolean;
  /** Which server slots hold a key; unknown on the hosted Worker. */
  slots?: KeySlots;
  /** Moves on every saved key change, so a replaced key is checked afresh. */
  connection: number;
  revision: string;
  onVerified: (verified: boolean) => void;
};

export default function AccountBalance(props: Props) {
  const { apiKey, hasServerKey, onVerified } = props;
  const connected = Boolean(apiKey || hasServerKey);
  useEffect(() => {
    if (!connected) onVerified(false);
  }, [connected, onVerified]);
  if (!connected)
    return (
      <span className="local-label">
        <i />
        ACCOUNT
      </span>
    );
  return <Balances {...props} />;
}

/** The connected readouts; the key is verified while any account answers. */
function Balances({ apiKey, slots, connection, revision, onVerified }: Props) {
  const [refresh, setRefresh] = useState(0);
  const comfy = slots?.comfy;
  const bfl = slots?.bfl;
  const shown = useMemo(
    () => balanceSlots(apiKey, { comfy, bfl }),
    [apiKey, comfy, bfl],
  );
  const { state, check } = useBalances({
    apiKey,
    shown,
    connection,
    revision,
    refresh,
    onVerified,
  });
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setRefresh((value) => value + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return (
    <div
      className={`account-balances${shown.length > 1 ? " account-balances--pair" : ""}`}
    >
      {shown.map((slot) => (
        <BalanceReadout
          key={slotId(slot)}
          provider={slot}
          state={state(slot)}
          onRefresh={check}
        />
      ))}
    </div>
  );
}

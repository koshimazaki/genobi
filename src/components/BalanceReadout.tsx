import { balanceText } from "../balance-format";
import type { BalanceState } from "../useBalances";
import type { KeyKind } from "../../shared/provider";
import Icon from "./Icon";

/**
 * One account's readout: the visit's key, or one of the server's slots
 * (`provider`). It shows its own amount or error, so a BFL failure never hides
 * the Comfy balance beside it; a click re-checks (`useBalances`).
 */
export default function BalanceReadout({
  provider,
  state,
  onRefresh,
}: {
  provider?: KeyKind;
  state: BalanceState;
  onRefresh: () => void;
}) {
  const { balance, error, loading } = state;
  const text = balance && balanceText(balance);
  const who =
    provider === "bfl" ? "BFL " : provider === "comfy" ? "Comfy " : "";
  const name = who.toUpperCase();
  return (
    <button
      className={`account-balance ${error ? "account-balance--error" : ""}`}
      onClick={onRefresh}
      disabled={loading}
      aria-label={`${loading ? "Checking" : "Refresh"} ${who}balance${text ? `. ${text.detail}` : ""}`}
      title={
        error ||
        (balance
          ? `${text!.detail} · checked ${new Date(balance.checkedAt).toLocaleTimeString()}. Click to refresh.`
          : "Check account balance")
      }
    >
      <span className="account-balance__readout" aria-live="polite">
        <span>
          {loading
            ? `CHECKING ${name}KEY`
            : error
              ? `${name}BALANCE UNAVAILABLE`
              : text?.label}
        </span>
        <strong>{text ? text.amount : loading ? "…" : "Retry"}</strong>
      </span>
      <Icon name="refresh" size={12} />
      {error && <span className="sr-only">{error}</span>}
    </button>
  );
}

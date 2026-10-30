import type { KeyKind } from "../shared/provider";

/** What `/api/credits` answers for one key; never the key itself. */
export type Balance = {
  /**
   * Comfy's balance in US cents, or BFL's credit count (1 credit = $0.01,
   * docs.bfl.ai/quick_start/pricing); null when the provider verified the key
   * but reports no balance.
   */
  credits: number | null;
  checkedAt: string;
  provider?: KeyKind;
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const count = (value: number) => Math.round(value).toLocaleString("en-US");

/**
 * BFL bills in credits at 1 credit = $0.01 ("1 credit = $0.01 USD",
 * https://docs.bfl.ai/quick_start/pricing, checked 30 October 2026), so a BFL
 * credit count is also its cents.
 */
export const BFL_CREDITS_PER_USD = 100;

/**
 * One readout's label and amount. Both accounts read in dollars so they can be
 * compared at a glance; BFL's own unit, credits, stays in the hover and
 * screen-reader text. Comfy's balance already arrives in US cents.
 */
export function balanceText(balance: Balance) {
  const bfl = balance.provider !== "comfy";
  const name = bfl ? "BFL" : "COMFY";
  if (balance.credits === null)
    return {
      label: `${name} KEY OK`,
      amount: "no balance",
      detail: "Key verified",
    };
  return {
    label: name,
    amount: dollars(balance.credits),
    detail: bfl
      ? `BFL balance ${dollars(balance.credits)}: ${count(balance.credits)} BFL credits (1 credit = $0.01)`
      : `Comfy balance ${dollars(balance.credits)}`,
  };
}

/** Under the price: which key pays for the run, from `payingKeyKind`. */
export const payerText = (kind: KeyKind) =>
  kind === "bfl" ? "Paid with your BFL key" : "Paid with your Comfy key";

/**
 * A run's price in dollars and in the unit of the account that pays: BFL
 * credits at BFL's documented rate, or Comfy credits — Router's own unit, the
 * one `X-Comfy-Credits-Used` reports — exact where the entry is priced in
 * them (LTX, H3), otherwise converted at `creditsPerUsd`, Comfy's approximate
 * plan rate (`CREDITS_PER_USD`), so marked "≈". Derived from the estimate
 * alone; nothing is asked of a provider.
 */
export function priceText(
  estimateUsd: number,
  payer: KeyKind,
  comfyCredits: number | null,
  creditsPerUsd: number,
) {
  const amount = `$${estimateUsd.toFixed(2)}`;
  if (payer === "bfl") {
    const credits = count(estimateUsd * BFL_CREDITS_PER_USD);
    return {
      amount,
      unit: `${credits} BFL cr`,
      detail: `${payerText(payer)}: ${amount} est., ${credits} BFL credits (1 credit = $0.01)`,
    };
  }
  const exact = comfyCredits !== null;
  const credits = count(exact ? comfyCredits : estimateUsd * creditsPerUsd);
  return {
    amount,
    unit: `${exact ? "" : "≈"}${credits} Comfy cr`,
    detail: `${payerText(payer)}: ${amount} est., ${exact ? "" : "about "}${credits} Comfy credits`,
  };
}

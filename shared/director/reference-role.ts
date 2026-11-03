/**
 * What an Inspiration is for. The owner's rule, 3 November 2026: an asset
 * whose `use` is `reference` (shown as an Inspiration) is something to be
 * inspired by, not something to generate from. A Pinterest moodboard or a
 * photo of a cat may inform the style, palette, layout, mood, structure and
 * wording of a prompt; its pixels are not sent to a model as an image
 * reference, a source frame, a swap source or any other generation input.
 * The person's production media lives under Project, and that is what a run
 * is made from.
 *
 * The one exception is explicit: the person asks, in the current request, for
 * an Inspiration to be used as an input. In the studio that is their own drag
 * into Camera's reference tray (which then says so); an agent passes
 * `allowInspirationAsInput: true` only when the person asked for it in this
 * request. Portable: the MCP adapter, the CLI and the studio read one rule.
 */
import type { AssetUse } from "./asset-media";

/** `production` assets are made from; `style` assets are only described. */
export type ReferenceRole = "production" | "style";

/** The opt-in field an agent sets when the person asked for it this request. */
export const INSPIRATION_OPT_IN = "allowInspirationAsInput";

/** The rule in one sentence, as agents and docs state it. */
export const INSPIRATION_RULE =
  'Inspirations (assets with use "reference") are style references: they may inform the style, palette, layout, mood, structure and wording of the prompt, but they are not sent as an image reference, source frame, swap source or any other generation input unless the person explicitly asks for that in the current request.';

/** The one-line notice the studio shows when the person uses one as input. */
export const INSPIRATION_INPUT_NOTICE =
  "Inspiration used as an image reference for this run";

export function referenceRole(use: AssetUse): ReferenceRole {
  return use === "reference" ? "style" : "production";
}

/** True when an asset of this use may be a generation input without opt-in. */
export function mayBeGenerationInput(use: AssetUse): boolean {
  return referenceRole(use) === "production";
}

/** The sentence an agent reads for one Inspiration bound in the brief. */
export function inspirationSentence(label: string): string {
  return `[${label}] is a style reference: describe what to take from it in the prompt; do not pass it as an image reference.`;
}

/**
 * One sentence per brief reference bound to an Inspiration, in brief order.
 * A font, a missing asset or production media adds none.
 */
export function briefRoleNotes(
  references: readonly { label: string; assetId?: string }[],
  assets: Readonly<Record<string, { use: AssetUse }>>,
): string[] {
  return references.flatMap((r) =>
    r.assetId &&
    Object.hasOwn(assets, r.assetId) &&
    referenceRole(assets[r.assetId].use) === "style"
      ? [inspirationSentence(r.label)]
      : [],
  );
}

/**
 * Refuse an Inspiration as a generation input unless the request opted in.
 * Throws a plain Error naming the asset and the rule.
 */
export function checkGenerationInput(
  asset: { assetId: string; use: AssetUse; label?: string | null },
  allowInspirationAsInput: boolean | undefined,
): void {
  if (mayBeGenerationInput(asset.use) || allowInspirationAsInput === true)
    return;
  const name = asset.label
    ? `${asset.assetId} (${asset.label})`
    : asset.assetId;
  throw new Error(
    `${name} is an Inspiration, a style reference. ${INSPIRATION_RULE} Describe what to take from it in the prompt instead, or set ${INSPIRATION_OPT_IN}: true only when the person asked for it in this request.`,
  );
}

import { readEffectVariant, type EffectVariant } from "../../shared/effects";

export const EFFECT_VARIANT_LIMIT = 24;
export const EFFECT_VARIANT_STORAGE_KEY = "genobi.effects.variants.v1";

export function readVariants(
  storage?: Pick<Storage, "getItem">,
): EffectVariant[] {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(
      EFFECT_VARIANT_STORAGE_KEY,
    );
    if (!raw || raw.length > 256_000) return [];
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.slice(0, EFFECT_VARIANT_LIMIT).flatMap((value) => {
      try {
        return [readEffectVariant(value)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function variantKey(variant: EffectVariant) {
  return `${variant.presetId}:${variant.name}`;
}

export function withVariant(variants: EffectVariant[], value: unknown) {
  const variant = readEffectVariant(value);
  return [
    variant,
    ...variants.filter((v) => variantKey(v) !== variantKey(variant)),
  ].slice(0, EFFECT_VARIANT_LIMIT);
}

export function storeVariants(
  variants: EffectVariant[],
  storage?: Pick<Storage, "setItem">,
) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      EFFECT_VARIANT_STORAGE_KEY,
      JSON.stringify(variants),
    );
    return true;
  } catch {
    return false;
  }
}

export function downloadVariant(variant: EffectVariant) {
  const blob = new Blob([JSON.stringify(variant, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${variant.name.replace(/[^a-z0-9_-]/gi, "-")}.effect.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { useSyncExternalStore } from "react";
import type { EffectVariant } from "../../shared/effects";
import {
  readVariants,
  storeVariants,
  variantKey,
  withVariant,
  EFFECT_VARIANT_STORAGE_KEY,
} from "./variant-store";

let snapshot: EffectVariant[] | undefined;
const empty: EffectVariant[] = [];
const listeners = new Set<() => void>();
const getSnapshot = () => (snapshot ??= readVariants());
function publish(next: EffectVariant[]) {
  snapshot = next;
  for (const listener of listeners) listener();
}
function readOtherTab(event: StorageEvent) {
  if (event.key === null || event.key === EFFECT_VARIANT_STORAGE_KEY)
    publish(readVariants());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", readOtherTab);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", readOtherTab);
  };
}

/** One tab collection shared by the mounted 3D and Editor pickers. */
export function useEffectVariants() {
  const variants = useSyncExternalStore(subscribe, getSnapshot, () => empty);
  return {
    variants,
    save(variant: EffectVariant) {
      const next = withVariant(getSnapshot(), variant);
      publish(next);
      return storeVariants(next);
    },
    remove(variant: EffectVariant) {
      const next = getSnapshot().filter(
        (v) => variantKey(v) !== variantKey(variant),
      );
      publish(next);
      storeVariants(next);
    },
  };
}

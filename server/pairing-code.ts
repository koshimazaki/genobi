/**
 * Compares a one-use pairing code in constant time, after the caller has
 * checked its format (32 lowercase hex characters), so how long a wrong
 * guess takes says nothing about how close it was. World's pairing and
 * Scrolls' fill both use it.
 */
import { timingSafeEqual } from "node:crypto";

export function sameCode(expected: string | undefined, given: string) {
  if (!expected || expected.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

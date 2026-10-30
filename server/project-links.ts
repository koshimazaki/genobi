// One-use link codes: the owner of a project copy shows one in the studio and
// an agent spends it to read and command that copy. Held in memory only, ten
// minutes each, at most 64 open at once.
import { AppError } from "./errors";
import { exactKeys, isObject, randomToken } from "./project-bundle";

export const LINK_MS = 10 * 60_000;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export class LinkCodes {
  private codes = new Map<string, { key: string; expires: number }>();

  /** A new code for the copy named by `key`. */
  create(key: string) {
    const now = Date.now();
    for (const [code, entry] of this.codes)
      if (entry.expires <= now) this.codes.delete(code);
    if (this.codes.size >= 64)
      throw new AppError(
        429,
        "Too many open link codes; wait a moment.",
        "link_limit",
      );
    let code: string;
    do code = randomToken(CODE_ALPHABET, 8);
    while (this.codes.has(code));
    const expires = now + LINK_MS;
    this.codes.set(code, { key, expires });
    return { code, expiresAt: new Date(expires).toISOString() };
  }

  /** Spend a code from a request body; the key of the copy it names. */
  spend(body: unknown) {
    const raw =
      isObject(body) && exactKeys(body, ["code"]) ? body.code : undefined;
    const code =
      typeof raw === "string" ? raw.toUpperCase().replace(/[\s-]/g, "") : "";
    const entry = /^[A-Z0-9]{8}$/.test(code) ? this.codes.get(code) : undefined;
    if (!entry || entry.expires <= Date.now())
      throw new AppError(
        404,
        "That link code is unknown or expired.",
        "link_missing",
      );
    this.codes.delete(code);
    return entry.key;
  }
}

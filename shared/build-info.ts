/**
 * The commit a hosted build was compiled from.
 *
 * `scripts/build-pages.mjs` passes the checked-out commit to esbuild as
 * `__GENOBI_COMMIT__`. A local server, `vitest` and the workerd harness build
 * the same modules with no `define`, so the identifier is absent there and
 * `typeof` — never a bare read — keeps that case a value instead of a crash.
 *
 * This exists because a merged fix is not a deployed fix: production skipped
 * its deploy for a day while `main` stayed green, and the only way to see it
 * was to diff the live bundle. `/api/health` now names the build it serves.
 */
declare const __GENOBI_COMMIT__: string;

/** Seven hex characters, as `git rev-parse --short`, or `dev` when unknown. */
export const BUILD_COMMIT: string =
  typeof __GENOBI_COMMIT__ === "undefined" ? "dev" : __GENOBI_COMMIT__;

/** A served commit is what this checkout built when either is a prefix of the other. */
export function servedCommitIs(served: unknown, expected: string): boolean {
  if (typeof served !== "string" || !served || served === "dev") return false;
  const a = served.toLowerCase();
  const b = expected.trim().toLowerCase();
  if (!b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

import { describe, expect, it } from "vitest";
import { BUILD_COMMIT, servedCommitIs } from "../shared/build-info";

/**
 * `/api/health` names the build it serves so a merged fix is not mistaken for
 * a live one. The comparison has to survive the two commits being quoted at
 * different lengths: Pages records a full sha, a bundle stamps seven chars.
 */
describe("a served build identity", () => {
  it("matches the same commit written short and long", () => {
    expect(
      servedCommitIs(
        "e1b7144",
        "e1b7144a9b6c1f7d2e3a4b5c6d7e8f9012345678".padEnd(40, "0"),
      ),
    ).toBe(true);
    expect(servedCommitIs("5d58364", "5d58364")).toBe(true);
    expect(servedCommitIs("E1B7144", "e1b7144")).toBe(true);
  });

  it("refuses a different commit, a missing one and a local build", () => {
    expect(servedCommitIs("93bd9e9", "e1b7144")).toBe(false);
    expect(servedCommitIs(undefined, "e1b7144")).toBe(false);
    // A local or test build carries no commit: that is not a match, it is
    // "unknown", and the check reports it as unversioned rather than fine.
    expect(servedCommitIs("dev", "e1b7144")).toBe(false);
    expect(servedCommitIs("e1b7144", "")).toBe(false);
  });

  it("reports no commit when built outside the Pages script", () => {
    // `vitest` compiles this module without the esbuild define, which is
    // exactly the local-server case the health route must still answer.
    expect(BUILD_COMMIT).toBe("dev");
  });
});

import { describe, expect, it } from "vitest";
import { BUILD_COMMIT } from "../shared/build-info";
import { call, useWorker } from "./worker-harness";

/**
 * A skipped deploy leaves production on an older bundle while `main` stays
 * green. The hosted health route is where that is answerable, so it must name
 * the build it was compiled from — never a hardcoded string and never nothing.
 */
useWorker();

describe("hosted health", () => {
  it("names the build the Worker serves", async () => {
    const response = await call("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      hasServerKey: false,
      hosted: true,
      commit: BUILD_COMMIT,
    });
  });
});

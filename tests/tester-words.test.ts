import { describe, expect, it } from "vitest";
import { isTesterToken, runsLeftWords } from "../shared/tester";
import { testerScoped } from "../worker/tester-routes";

describe("tester access helpers", () => {
  it("says remaining runs in words", () => {
    expect(runsLeftWords(10)).toBe("Ten test runs left.");
    expect(runsLeftWords(1)).toBe("One test run left.");
    expect(runsLeftWords(0)).toBe("No test runs left.");
    expect(runsLeftWords(42)).toBe("42 test runs left.");
  });
  it("recognises only the tester token shape", () => {
    expect(isTesterToken("comfyui-tester.1.abc")).toBe(true);
    expect(isTesterToken("comfyui-abc")).toBe(false);
    expect(isTesterToken(undefined)).toBe(false);
  });
  it("scopes the operator key to the deployment routes", () => {
    expect(testerScoped("POST", "/api/quotes")).toBe(true);
    expect(testerScoped("POST", "/api/jobs")).toBe(true);
    expect(testerScoped("GET", "/api/jobs/abc")).toBe(true);
    expect(
      testerScoped("POST", "/api/settings/deployment-assets/TAKE_WEBM"),
    ).toBe(true);
    for (const [method, path] of [
      ["GET", "/api/credits"],
      ["POST", "/api/uploads"],
      ["POST", "/api/chains"],
      ["GET", "/api/settings/workflows"],
    ])
      expect(testerScoped(method, path)).toBe(false);
  });
});

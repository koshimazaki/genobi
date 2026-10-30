import { describe, expect, it } from "vitest";
import { licenceMarkdown, licenceReport } from "../shared/licensing/report";
import { parseUsage } from "../shared/licensing/types";
import { parseAgentContext, contextBlock } from "../shared/agent-context";
import { readFileSync } from "node:fs";
import { tasteLibraries } from "../shared/licensing/report";
const commercial = {
  purpose: "commercial-video",
  policy: "any-licensed",
} as const;
describe("licence-aware selection", () => {
  it("publishes the same catalogue and preserves reviewed licence evidence", () => {
    expect(
      JSON.parse(readFileSync("public/credits/catalog.json", "utf8")),
    ).toEqual(tasteLibraries);
    expect(new Set(tasteLibraries.map((item) => item.id)).size).toBe(
      tasteLibraries.length,
    );
    for (const item of tasteLibraries) {
      expect(
        readFileSync(`docs/credits/libraries/${item.id}/LICENSE.txt`, "utf8")
          .length,
      ).toBeGreaterThan(100);
      expect(item.source).toMatch(/^https:\/\//);
    }
  });
  it("distinguishes commercial output from source redistribution", () => {
    expect(
      licenceReport(commercial, ["transitions-ui-generation"]).rows[0].decision,
    ).toBe("conditions");
    expect(
      licenceReport({ ...commercial, purpose: "resell-template" }, [
        "transitions-ui-generation",
      ]).rows[0].decision,
    ).toBe("review");
  });
  it("does not treat commercially usable Apache as MIT", () => {
    expect(licenceReport(commercial, ["paper-shaders"]).rows[0].decision).toBe(
      "conditions",
    );
    expect(
      licenceReport({ ...commercial, policy: "mit-only" }, ["paper-shaders"])
        .rows[0].decision,
    ).toBe("excluded");
  });
  it("expands MIT wrapper dependencies before a strict check", () => {
    const report = licenceReport({ ...commercial, policy: "mit-only" }, [
      "claude-animation-base",
    ]);
    expect(report.rows.find((r) => r.id === "p5")?.decision).toBe("excluded");
    expect(report.needsReview).toBe(true);
  });
  it("keeps unknown models/assets and empty inventories unresolved", () => {
    expect(
      licenceReport(commercial, ["unknown-model", "my-artwork"]).rows.every(
        (r) => r.decision === "review",
      ),
    ).toBe(true);
    expect(licenceReport(commercial, []).needsReview).toBe(true);
  });
  it("does not treat mixed-content asset rights as open-source code permission", () => {
    for (const policy of ["any-licensed", "open-source"] as const) {
      const report = licenceReport({ ...commercial, policy }, [
        "ascii-magic-art",
      ]);
      expect(report.rows[0].decision).toBe("review");
      expect(report.rows[0].reason).toContain("selected pieces");
    }
  });
  it("never fills a used inventory with an unobserved catalogue version", () => {
    const missing = licenceReport(commercial, ["three"], "used");
    expect(missing.rows[0]).toMatchObject({
      version: null,
      reviewedVersion: "0.180.0",
      decision: "review",
    });
    expect(
      licenceReport(commercial, ["three"], "used", { three: "0.181.0" })
        .rows[0],
    ).toMatchObject({ version: "0.181.0", decision: "review" });
    expect(
      licenceReport(commercial, ["three"], "used", { three: "0.180.0" }).rows[0]
        .decision,
    ).toBe("conditions");
  });
  it("checks actual dependency versions and preserves policy exclusions", () => {
    const report = licenceReport(commercial, ["p5-brush"], "used", {
      "p5-brush": tasteLibraries.find((item) => item.id === "p5-brush")!
        .version,
    });
    expect(report.rows.find((row) => row.id === "p5")?.decision).toBe("review");
    expect(
      licenceReport({ ...commercial, policy: "mit-only" }, ["p5"], "used")
        .rows[0].decision,
    ).toBe("excluded");
  });
  it("bounds version evidence and refuses unrelated or injectable version claims", () => {
    const invalidVersions: Record<string, string>[] = [
      { three: "x\n|injected" },
      { three: "x".repeat(129) },
      { unrelated: "1.0" },
    ];
    for (const versions of invalidVersions)
      expect(() =>
        licenceReport(commercial, ["three"], "used", versions),
      ).toThrow();
  });
  it("never upgrades custom source-available terms to open source", () => {
    expect(
      licenceReport({ ...commercial, policy: "open-source" }, [
        "transitions-ui-generation",
      ]).rows[0].decision,
    ).toBe("excluded");
  });
  it("reports actual selected items and known dependencies only", () => {
    const report = licenceReport(commercial, ["three", "three"], "used");
    expect(report.rows).toHaveLength(1);
    expect(licenceMarkdown(report)).toContain("Inventory: used");
    expect(licenceMarkdown(report)).not.toContain("Paper Shaders");
  });
  it("rejects invalid preferences and unbounded/injectable identifiers", () => {
    expect(() =>
      parseUsage({ purpose: "anything", policy: "mit-only" }),
    ).toThrow();
    expect(() => licenceReport(commercial, ["bad\n|id"])).toThrow();
    expect(() => licenceReport(commercial, Array(101).fill("three"))).toThrow();
  });
  it("carries validated user intent into the agent brief", () => {
    const context = parseAgentContext({ picks: [], usage: commercial });
    expect(context.usage).toEqual(commercial);
    expect(contextBlock(context)).toContain("genobi-licensing");
    expect(contextBlock(context)).toContain("commercial-video");
    expect(() =>
      parseAgentContext({ picks: [], usage: { purpose: "yes" } }),
    ).toThrow();
  });
});

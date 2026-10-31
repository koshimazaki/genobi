import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES_FILE,
  checkCapabilities,
  mentionsDate,
  parseEvidence,
  readCapabilities,
  sectionText,
  serializeCapabilities,
  verbTool,
  type CapabilityMap,
} from "../scripts/lib/capabilities";
import { run } from "../cli/run";

const root = path.join(import.meta.dirname, "..");
const committed = readCapabilities(root);
const copy = (): CapabilityMap => structuredClone(committed);
const entry = (map: CapabilityMap, id: string) =>
  map.capabilities.find((item) => item.id === id)!;

describe("capability map", () => {
  it("is consistent with the registry and the repository", () => {
    expect(checkCapabilities(root, committed)).toEqual([]);
  });

  it("is committed in the layout npm run capabilities writes", () => {
    expect(readFileSync(path.join(root, CAPABILITIES_FILE), "utf8")).toBe(
      serializeCapabilities(committed),
    );
  });

  it("refuses unknown tools, skills, docs, routes, models and statuses", () => {
    const map = copy();
    const camera = entry(map, "ltx-router");
    camera.mcp.push("genobi_teleport");
    camera.skills.push("no-such-skill");
    camera.docs.push("docs/no-such-page.md");
    camera.runs.push({ route: "moon" as never, models: [] });
    camera.runs.push({ route: "paid-api", models: ["gpt-video"] });
    entry(map, "arena").status = "shipped" as never;
    const problems = checkCapabilities(root, map).join("\n");
    expect(problems).toContain("unknown MCP tool genobi_teleport");
    expect(problems).toContain("unknown skill no-such-skill");
    expect(problems).toContain("doc docs/no-such-page.md");
    expect(problems).toContain("route moon");
    expect(problems).toContain("unknown model gpt-video");
    expect(problems).toContain("status shipped");
  });

  it("needs a dated record that exists for every verified feature", () => {
    const map = copy();
    entry(map, "arena").status = "verified";
    entry(map, "media-space").evidence = "2026-10-24 docs/media-space.md";
    entry(map, "voice-mode").status = "verified";
    entry(map, "voice-mode").evidence =
      "2026-10-21 docs/voice-mode.md#no-such-section";
    entry(map, "scrolls").evidence = "2026-10-21 docs/scrolls.md#what-works";
    const problems = checkCapabilities(root, map).join("\n");
    expect(problems).toContain("capability arena: verified needs evidence");
    expect(problems).toContain(
      "capability media-space: verified needs evidence",
    );
    expect(problems).toContain("has no section #no-such-section");
    expect(problems).toContain(
      "capability scrolls: evidence belongs to verified entries only",
    );
    expect(parseEvidence("2026-02-30 docs/a.md#b")).toBeNull();
  });

  it("needs the record's section to name the evidence date", () => {
    const map = copy();
    entry(map, "voice-mode").status = "verified";
    entry(map, "voice-mode").evidence =
      "2026-10-22 docs/voice-mode.md#verification";
    expect(checkCapabilities(root, map)).toContain(
      "capability voice-mode: evidence section #verification does not name 2026-10-22",
    );
    expect(mentionsDate("Run on 21 October 2026.", "2026-10-21")).toBe(true);
    expect(mentionsDate("see 2026-10-28-hermes.md", "2026-10-28")).toBe(true);
    expect(mentionsDate("21 October", "2026-10-21")).toBe(false);
    expect(sectionText("# A\n## B\ntext\n## C\nmore", "b")).toBe("## B\ntext");
  });

  it("fails when a registry tool or skill is in no feature", () => {
    const map = copy();
    for (const item of map.capabilities) {
      item.mcp = item.mcp.filter((tool) => tool !== "genobi_arena");
      item.cli = item.cli.filter((verb) => verb !== "arena");
      item.skills = item.skills.filter((skill) => skill !== "genobi-machine");
    }
    const problems = checkCapabilities(root, map);
    expect(problems).toContain(
      "registry tool genobi_arena is in no capability",
    );
    expect(problems).toContain(
      "registry skill genobi-machine is in no capability",
    );
  });

  it("ties each CLI verb to a tool the feature lists", () => {
    expect(verbTool("swords trim")).toBe("genobi_media_trim");
    expect(verbTool("take-to-project")).toBe("genobi_take_to_project");
    expect(verbTool("capabilities")).toBeNull();
    const map = copy();
    entry(map, "arena").cli.push("submit", "teleport");
    const problems = checkCapabilities(root, map).join("\n");
    expect(problems).toContain('"submit" runs genobi_submit, not listed');
    expect(problems).toContain('"teleport" names no tool or command');
  });

  it("is what genobi capabilities prints, offline", async () => {
    await expect(run(["capabilities"], { env: {} })).resolves.toEqual(
      committed,
    );
    await expect(run(["capabilities", "camera"], { env: {} })).rejects.toThrow(
      "without arguments",
    );
  });
});

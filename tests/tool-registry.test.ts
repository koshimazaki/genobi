import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tools } from "../mcp/tools";
import { GENOBI_TOOLS } from "../server/agent-runner";
import {
  REGISTRY_FILE,
  generate,
  toolsTaught,
  type SkillEntry,
  type ToolEntry,
  type ToolRegistry,
} from "../scripts/lib/tool-registry";

// The registry is generated from the tool definitions and the skills'
// frontmatter (npm run registry). These check the committed file against
// that source and hold the coverage rules the roadmap asks for (#14, #24).
const root = path.resolve(".");
const committed = JSON.parse(
  readFileSync(path.join(root, REGISTRY_FILE), "utf8"),
) as ToolRegistry;
const toolEntries = committed.entries.filter(
  (entry): entry is ToolEntry => entry.kind === "tool",
);
const skillEntries = committed.entries.filter(
  (entry): entry is SkillEntry => entry.kind === "skill",
);

describe("tool and skill registry", () => {
  it("matches its source: the registry and its wiki pages are current", async () => {
    const { problems, files } = await generate(root);
    expect(problems).toEqual([]);
    for (const [file, text] of files)
      expect(readFileSync(path.join(root, file), "utf8"), file).toBe(text);
  });

  it("lists every MCP tool and every plugin skill", () => {
    expect(toolEntries.map((entry) => entry.name)).toEqual(
      tools.map((tool) => tool.name),
    );
    const folders = skillEntries.map((entry) => entry.path);
    expect(folders.length).toBeGreaterThan(0);
    for (const file of folders) expect(existsSync(file), file).toBe(true);
  });

  it("has a skill that teaches every tool", () => {
    const untaught = toolEntries
      .filter((entry) => entry.skills.length === 0)
      .map((entry) => entry.name);
    expect(untaught).toEqual([]);
    // And the two directions agree.
    for (const tool of toolEntries)
      for (const skill of tool.skills)
        expect(
          skillEntries.find((entry) => entry.name === skill)?.tools,
          `${skill} uses ${tool.name}`,
        ).toContain(tool.name);
  });

  it("links only docs that exist, and tags only from docs/tags.md", () => {
    const vocabulary = readFileSync(path.join(root, "docs/tags.md"), "utf8");
    for (const entry of committed.entries) {
      expect(entry.docs.length, entry.name).toBeGreaterThan(0);
      for (const doc of entry.docs) {
        const file = path.join(root, doc);
        expect(existsSync(file) && statSync(file).isFile(), doc).toBe(true);
      }
      for (const tag of entry.tags)
        expect(vocabulary, `${entry.name}: ${tag}`).toContain(`| \`${tag}\``);
    }
  });

  it("marks only the confirmed submissions as paid, and keeps them out of sessions", () => {
    expect(
      toolEntries.filter((entry) => entry.paid).map((entry) => entry.name),
    ).toEqual([
      "genobi_submit",
      "genobi_upscale_parts_confirm",
      "genobi_upscale_parts_retry_confirm",
    ]);
    for (const entry of toolEntries) {
      if (entry.paid) expect(GENOBI_TOOLS).not.toContain(entry.name);
      if (entry.paid) expect(entry.readOnly).toBe(false);
    }
  });

  it("does not count a catalogue row as teaching a tool", () => {
    const body = [
      "| `genobi_quote` | Price a run |",
      "Call `genobi_status` first, then genobi_jobs.",
    ].join("\n");
    expect(
      toolsTaught(body, ["genobi_quote", "genobi_status", "genobi_job"]),
    ).toEqual(["genobi_status"]);
  });
});

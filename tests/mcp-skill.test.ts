import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { GenobiApi } from "../mcp/api";
import {
  MAX_SKILL_BYTES,
  listSkills,
  readSkill,
  skillRoot,
  skillTools,
} from "../mcp/skill-tools";
import { tools } from "../mcp/tools";

const plugin = path.resolve("plugins/genobi/skills");
const [tool] = skillTools(plugin);
// The tool reads files only; a studio client it never uses stands in.
const api = {} as GenobiApi;
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true });
});
function temp() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "genobi-skills-"));
  temps.push(dir);
  return dir;
}

describe("genobi_skill", () => {
  it("is a read-only tool of the MCP server", () => {
    const registered = tools.find((t) => t.name === "genobi_skill");
    expect(registered?.annotations.readOnlyHint).toBe(true);
  });

  it("finds the plugin's skills from the bundle and from source", () => {
    expect(skillRoot(path.resolve("plugins/genobi/server"))).toBe(plugin);
    expect(skillRoot(path.resolve("mcp"))).toBe(plugin);
  });

  it("lists exactly the skill folders, each with its description", async () => {
    const { skills } = (await tool.run(api, {})) as {
      skills: { name: string; description: string; tags: string[] }[];
    };
    expect(skills.map((s) => s.name)).toEqual(readdirSync(plugin).sort());
    for (const skill of skills) {
      expect(skill.description.length, skill.name).toBeGreaterThan(20);
      // Tags come from the metadata, checked against docs/tags.md by the registry.
      expect(skill.tags.length, skill.name).toBeGreaterThan(0);
    }
  });

  it("returns a skill's body without its frontmatter", async () => {
    const skill = (await tool.run(api, { name: "genobi-director" })) as {
      name: string;
      body: string;
    };
    expect(skill.name).toBe("genobi-director");
    expect(skill.body.startsWith("# Genobi director")).toBe(true);
    expect(skill.body).not.toMatch(/^name: /m);
  });

  it("refuses unknown and path-like names", async () => {
    const schema = z.strictObject(tool.inputSchema);
    for (const name of [
      "../genobi-studio",
      "genobi-studio/../../package.json",
      "/etc/passwd",
      "Genobi-Studio",
      "genobi-studio\u0000",
    ])
      expect(schema.safeParse({ name }).success, name).toBe(false);
    // A well-formed name that is not a listed skill is refused too.
    await expect(tool.run(api, { name: "no-such-skill" })).rejects.toThrow(
      /Unknown skill/,
    );
    await expect(tool.run(api, { name: "../genobi-studio" })).rejects.toThrow(
      /Unknown skill/,
    );
  });

  it("reads tags, and refuses a skill that is too large or leads outside", () => {
    const root = temp();
    mkdirSync(path.join(root, "small"));
    writeFileSync(
      path.join(root, "small", "SKILL.md"),
      "---\nname: small\ndescription: A small skill\nmetadata:\n  tags: [camera, ltx]\n---\n\n# Small\n",
    );
    expect(readSkill(root, "small").body).toBe("# Small");
    mkdirSync(path.join(root, "huge"));
    writeFileSync(
      path.join(root, "huge", "SKILL.md"),
      `---\nname: huge\ndescription: Too big\n---\n${"x".repeat(MAX_SKILL_BYTES)}`,
    );
    expect(() => readSkill(root, "huge")).toThrow(/Unknown skill/);
    const outside = temp();
    writeFileSync(path.join(outside, "SKILL.md"), "---\nname: away\n---\n");
    symlinkSync(outside, path.join(root, "away"));
    expect(() => readSkill(root, "away")).toThrow(/Unknown skill/);
    // A real folder whose SKILL.md links outside is not offered either.
    mkdirSync(path.join(root, "linked"));
    symlinkSync(
      path.join(outside, "SKILL.md"),
      path.join(root, "linked", "SKILL.md"),
    );
    expect(() => readSkill(root, "linked")).toThrow(/Unknown skill/);
    expect(listSkills(root)).toEqual([
      { name: "small", description: "A small skill", tags: ["camera", "ltx"] },
    ]);
  });
});

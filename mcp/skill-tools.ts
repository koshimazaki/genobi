import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ToolDefinition } from "./definition";

/**
 * The plugin's skills, loaded as a task needs them rather than all up front.
 * They are read from the plugin's own `skills/` folder, found from this file:
 * beside the bundle (`plugins/genobi/server/../skills`) or, from source, in
 * the repository. Nothing the agent sends names a path; a skill is chosen
 * from the names listed. Reads files only, never the studio, so never pays.
 */
const SKILL_NAME = /^[a-z][a-z0-9-]{0,63}$/;
/** A skill larger than this is refused rather than read into a reply. */
export const MAX_SKILL_BYTES = 64 * 1024;

export function skillRoot(
  from = path.dirname(fileURLToPath(import.meta.url)),
): string {
  const candidates = [
    path.join(from, "..", "skills"),
    path.join(from, "..", "plugins", "genobi", "skills"),
  ];
  return (
    candidates.find((dir) =>
      existsSync(path.join(dir, "genobi-studio", "SKILL.md")),
    ) ?? candidates[0]
  );
}

interface SkillSummary {
  name: string;
  description: string;
  tags: string[];
}

/** The frontmatter block and the body after it. */
function split(text: string) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  return match
    ? { front: match[1], body: text.slice(match[0].length).trim() }
    : { front: "", body: text.trim() };
}

/**
 * `key: [a, b]`, `key: a, b` or `key: "a, b"`, top level or under `metadata`
 * (whose values Agent Skills hosts read as strings).
 */
export function listField(front: string, key: "tags" | "docs") {
  const raw = new RegExp(`^\\s*${key}:\\s*(.+)$`, "m").exec(front)?.[1] ?? "";
  return raw
    .replace(/^["']|["']$/g, "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function listSkills(root: string): SkillSummary[] {
  if (!existsSync(root)) return [];
  const skills: SkillSummary[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SKILL_NAME.test(entry.name)) continue;
    let front: string;
    try {
      ({ front } = split(readSkillFile(root, entry.name)));
    } catch {
      continue; // Missing, too large or outside the folder: not offered.
    }
    skills.push({
      name: entry.name,
      description: /^description:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? "",
      tags: listField(front, "tags"),
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function readSkillFile(root: string, name: string) {
  const file = path.join(root, name, "SKILL.md");
  // A symlink inside the folder must not lead outside it.
  const real = realpathSync(file);
  if (!real.startsWith(realpathSync(root) + path.sep))
    throw new Error(`Skill ${name} is outside the plugin's skills folder.`);
  if (statSync(real).size > MAX_SKILL_BYTES)
    throw new Error(`Skill ${name} is larger than ${MAX_SKILL_BYTES} bytes.`);
  return readFileSync(real, "utf8");
}

/** A listed skill's frontmatter and body, for the registry generator. */
export function skillSource(root: string, name: string) {
  return split(readSkillFile(root, name));
}

export function readSkill(root: string, name: unknown) {
  const names = listSkills(root).map((skill) => skill.name);
  if (typeof name !== "string" || !names.includes(name))
    throw new Error(`Unknown skill. Use one of: ${names.join(", ")}.`);
  const { front, body } = split(readSkillFile(root, name));
  return {
    name,
    description: /^description:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? "",
    body,
  };
}

export function skillTools(root = skillRoot()): ToolDefinition[] {
  return [
    {
      name: "genobi_skill",
      title: "Genobi skill",
      description:
        "Load a Genobi skill when the task needs it. With no name, list every skill: its name, one-line description and tags. With a name from that list, return the skill's instructions. Load the ones the task needs before acting. Reads the plugin's files only; never pays.",
      inputSchema: {
        name: z
          .string()
          .regex(SKILL_NAME)
          .optional()
          .describe("A skill name from the list, for example genobi-director"),
      },
      tags: ["agents", "mcp"],
      docs: ["docs/agent-sessions.md", "plugins/genobi/README.md"],
      annotations: { readOnlyHint: true, idempotentHint: true },
      async run(_api, args) {
        return args.name === undefined
          ? { skills: listSkills(root) }
          : readSkill(root, args.name);
      },
    },
  ];
}

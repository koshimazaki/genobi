// The tool and skill registry: every MCP tool (from its definition in mcp/)
// and every plugin skill (from its SKILL.md frontmatter), with tags from
// docs/tags.md, linked docs, which skills teach a tool and which tools a skill
// uses. Built from source only, never from a hand-kept list, and rendered as
// plugins/genobi/registry.json plus three wiki pages.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { format } from "prettier";
import type { ToolDefinition } from "../../mcp/definition";
import { listField, listSkills, skillSource } from "../../mcp/skill-tools";
import { tools as mcpTools } from "../../mcp/tools";
import { tagVocabulary } from "./wiki.mjs";

export const REGISTRY_FILE = "plugins/genobi/registry.json";
export const SKILLS_DIR = "plugins/genobi/skills";
export const PAGES = {
  index: "docs/registry.md",
  tools: "docs/registry-tools.md",
  skills: "docs/registry-skills.md",
} as const;
const GITHUB = "https://github.com/koshimazaki/Genobi/blob/main/";

export interface ToolEntry {
  kind: "tool";
  name: string;
  title: string;
  description: string;
  tags: string[];
  docs: string[];
  readOnly: boolean;
  paid: boolean;
  /** Skills whose instructions name the tool. */
  skills: string[];
}
export interface SkillEntry {
  kind: "skill";
  name: string;
  description: string;
  tags: string[];
  docs: string[];
  path: string;
  /** Tools the skill's instructions name. */
  tools: string[];
}
export type Entry = ToolEntry | SkillEntry;
export interface ToolRegistry {
  generated: string;
  tags: Record<string, { meaning: string; entries: string[] }>;
  entries: Entry[];
}

/**
 * A catalogue row (a table row whose first cell is a tool name, as in
 * genobi-studio's tool table) lists a tool without teaching it, so it does not
 * count. Any other mention in a skill's instructions does.
 */
const CATALOGUE_ROW = /^\|\s*`genobi_[a-z_]+`\s*\|.*$/gm;

export function toolsTaught(body: string, names: string[]) {
  const text = body.replace(CATALOGUE_ROW, "");
  return names.filter((name) => new RegExp(`\\b${name}\\b`).test(text));
}

/** Builds the registry from the tool definitions and the skills folder. */
export function buildRegistry(
  repoRoot: string,
  tools: ToolDefinition[] = mcpTools,
): { registry: ToolRegistry; problems: string[] } {
  const problems: string[] = [];
  const vocabulary = tagVocabulary(
    readFileSync(path.join(repoRoot, "docs/tags.md"), "utf8"),
  );
  const checkTags = (where: string, tags: string[]) => {
    if (!tags.length) problems.push(`${where}: no tags`);
    for (const tag of tags)
      if (!vocabulary.has(tag))
        problems.push(`${where}: tag "${tag}" is not in docs/tags.md`);
    if (new Set(tags).size !== tags.length)
      problems.push(`${where}: repeated tag`);
  };
  const checkDocs = (where: string, docs: string[]) => {
    if (!docs.length) problems.push(`${where}: no linked docs`);
    // The registry's own pages count: this build writes them.
    const generated = new Set<string>(Object.values(PAGES));
    for (const doc of docs) {
      const file = path.join(repoRoot, doc);
      if (generated.has(doc)) continue;
      if (
        path.isAbsolute(doc) ||
        path.relative(repoRoot, file).startsWith("..") ||
        !existsSync(file) ||
        !statSync(file).isFile()
      )
        problems.push(`${where}: linked doc ${doc} is not a repository file`);
    }
  };

  const names = tools.map((tool) => tool.name);
  if (new Set(names).size !== names.length)
    problems.push("mcp: two tools share a name");
  const skillsRoot = path.join(repoRoot, SKILLS_DIR);
  const skills: SkillEntry[] = listSkills(skillsRoot).map(
    ({ name, description, tags }) => {
      const { front, body } = skillSource(skillsRoot, name);
      const docs = listField(front, "docs");
      checkTags(`skill ${name}`, tags);
      checkDocs(`skill ${name}`, docs);
      return {
        kind: "skill",
        name,
        description,
        tags,
        docs,
        path: `${SKILLS_DIR}/${name}/SKILL.md`,
        tools: toolsTaught(body, names),
      };
    },
  );
  const toolEntries: ToolEntry[] = tools.map((tool) => {
    checkTags(`tool ${tool.name}`, tool.tags);
    checkDocs(`tool ${tool.name}`, tool.docs);
    if (tool.paid && tool.annotations.readOnlyHint)
      problems.push(`tool ${tool.name}: paid but marked read-only`);
    return {
      kind: "tool",
      name: tool.name,
      title: tool.title,
      description: tool.description,
      tags: tool.tags,
      docs: tool.docs,
      readOnly: tool.annotations.readOnlyHint,
      paid: tool.paid === true,
      skills: skills
        .filter((skill) => skill.tools.includes(tool.name))
        .map((skill) => skill.name),
    };
  });
  const entries: Entry[] = [...toolEntries, ...skills];
  const tags: ToolRegistry["tags"] = {};
  for (const [tag, meaning] of vocabulary) {
    const tagged = entries.filter((entry) => entry.tags.includes(tag));
    if (tagged.length)
      tags[tag] = { meaning, entries: tagged.map((entry) => entry.name) };
  }
  return {
    registry: {
      generated: `By scripts/registry.ts from mcp/ and ${SKILLS_DIR}/; run npm run registry. Doc paths are relative to the repository root.`,
      tags,
      entries,
    },
    problems,
  };
}

const docLink = (doc: string) =>
  doc.startsWith("docs/")
    ? `[${doc}](${doc.slice("docs/".length)})`
    : `[${doc}](${GITHUB}${doc})`;
const toolLink = (name: string) => `[\`${name}\`](registry-tools.md#${name})`;
const skillLink = (name: string) => `[\`${name}\`](registry-skills.md#${name})`;
const access = (tool: ToolEntry) =>
  tool.paid ? "**paid**" : tool.readOnly ? "read-only" : "writes";
const list = (items: string[], none = "none") =>
  items.length ? items.join(", ") : none;
const NOTICE =
  "<!-- Generated by npm run registry from mcp/ and plugins/genobi/skills/. Do not edit; change the tool definition or the skill's frontmatter. -->";

function page(tags: string, summary: string, title: string, body: string[]) {
  return [
    "---",
    `tags: [${tags}]`,
    `summary: ${summary}`,
    "---",
    "",
    `# ${title}`,
    "",
    NOTICE,
    "",
    ...body,
  ].join("\n");
}

/** The three wiki pages, keyed by repository path. */
export function renderPages(registry: ToolRegistry): Map<string, string> {
  const tools = registry.entries.filter(
    (entry): entry is ToolEntry => entry.kind === "tool",
  );
  const skills = registry.entries.filter(
    (entry): entry is SkillEntry => entry.kind === "skill",
  );
  const byName = new Map(registry.entries.map((entry) => [entry.name, entry]));

  const index: string[] = [
    `Every tool of the Genobi MCP server and every skill of the plugin, grouped by tag: ${tools.length} tools and ${skills.length} skills. Each tool links to the skills that teach it and the docs behind it; [the tools page](registry-tools.md) and [the skills page](registry-skills.md) hold each one's full description.`,
    "",
    `The pages are rendered from [\`${REGISTRY_FILE}\`](${GITHUB}${REGISTRY_FILE}), which \`npm run registry\` generates from the tool definitions in \`mcp/\` and the skills' frontmatter. Agents search the same file with \`genobi_registry\`. \`npm run check:registry\` fails when the file or these pages are stale.`,
    "",
    `For features rather than tools (where each one is in the studio, whether it runs free and local, on a local open model, on Comfy Cloud or through a paid API, and its status), see [the capability map](capabilities.md).`,
    "",
  ];
  for (const [tag, { meaning, entries }] of Object.entries(registry.tags)) {
    index.push(`## \`${tag}\``, "", meaning, "");
    for (const name of entries) {
      const entry = byName.get(name)!;
      index.push(
        entry.kind === "tool"
          ? `- ${toolLink(name)} · ${access(entry)} · taught by ${list(entry.skills.map(skillLink))} · ${entry.docs.map(docLink).join(", ")}`
          : `- skill ${skillLink(name)} · uses ${entry.tools.length} tools · ${entry.docs.map(docLink).join(", ")}`,
      );
    }
    index.push("");
  }

  const toolPage: string[] = [
    `Each tool of the Genobi MCP server: what it does, whether it is read-only, writes or is paid, the skills that teach it and its docs. Grouped by tag on [the registry](registry.md).`,
    "",
  ];
  for (const tool of tools)
    toolPage.push(
      `## \`${tool.name}\``,
      "",
      `${tool.title} · ${access(tool)}. ${tool.description}`,
      "",
      `- Tags: ${tool.tags.map((tag) => `\`${tag}\``).join(", ")}`,
      `- Taught by: ${list(tool.skills.map(skillLink))}`,
      `- Docs: ${tool.docs.map(docLink).join(", ")}`,
      "",
    );

  const skillPage: string[] = [
    `Each skill of the Genobi plugin: what it is for, the tools its instructions use and its docs. Agents load one with \`genobi_skill\`. Grouped by tag on [the registry](registry.md).`,
    "",
  ];
  for (const skill of skills)
    skillPage.push(
      `## \`${skill.name}\``,
      "",
      skill.description,
      "",
      `- Tags: ${skill.tags.map((tag) => `\`${tag}\``).join(", ")}`,
      `- Instructions: [${skill.path}](${GITHUB}${skill.path})`,
      `- Uses: ${list(skill.tools.map(toolLink))}`,
      `- Docs: ${skill.docs.map(docLink).join(", ")}`,
      "",
    );

  return new Map([
    [
      PAGES.index,
      page(
        "agents, mcp",
        "Every Genobi MCP tool and plugin skill by tag, with the skills that teach each tool and its docs; generated from the plugin registry.",
        "Tool and skill registry",
        index,
      ),
    ],
    [
      PAGES.tools,
      page(
        "agents, mcp",
        "Every Genobi MCP tool with its description, access, teaching skills and docs; generated from the plugin registry.",
        "Registry: tools",
        toolPage,
      ),
    ],
    [
      PAGES.skills,
      page(
        "agents, mcp",
        "Every Genobi plugin skill with its description, the tools it uses and its docs; generated from the plugin registry.",
        "Registry: skills",
        skillPage,
      ),
    ],
  ]);
}

/** Every generated file, formatted as committed, keyed by repository path. */
export async function generate(repoRoot: string) {
  const { registry, problems } = buildRegistry(repoRoot);
  const files = new Map<string, string>([
    [REGISTRY_FILE, JSON.stringify(registry)],
    ...renderPages(registry),
  ]);
  for (const [file, text] of files)
    files.set(
      file,
      await format(text, { filepath: path.join(repoRoot, file) }),
    );
  return { registry, problems, files };
}

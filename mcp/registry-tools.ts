import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "./definition";
import { skillRoot } from "./skill-tools";

/**
 * Search the plugin's registry: every MCP tool and skill with its tags, linked
 * docs, which skill teaches a tool and which tools a skill uses. The registry
 * is `registry.json` beside the plugin's `skills/` folder, generated from the
 * tool definitions and the skills' frontmatter by `npm run registry`. Reads
 * that one file only; never the studio, never pays.
 */
const TAG = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** A registry larger than this is refused rather than parsed. */
export const MAX_REGISTRY_BYTES = 512 * 1024;

export interface RegistryEntry {
  kind: "tool" | "skill";
  name: string;
  description: string;
  tags: string[];
  docs: string[];
  [field: string]: unknown;
}

export interface Registry {
  tags: Record<string, { meaning: string; entries: string[] }>;
  entries: RegistryEntry[];
}

export function registryPath(root = skillRoot()) {
  return path.join(path.dirname(root), "registry.json");
}

export function readRegistry(file: string): Registry {
  if (!existsSync(file) || statSync(file).size > MAX_REGISTRY_BYTES)
    throw new Error(
      "The plugin's registry.json is missing or too large; run npm run registry.",
    );
  const data = JSON.parse(readFileSync(file, "utf8")) as Partial<Registry>;
  if (!Array.isArray(data.entries) || typeof data.tags !== "object")
    throw new Error("The plugin's registry.json is not a registry.");
  return { tags: data.tags ?? {}, entries: data.entries };
}

export interface RegistryQuery {
  tag?: string;
  text?: string;
  kind?: "tool" | "skill";
}

/** Entries matching every filter given: a tag, words in the text, a kind. */
export function searchRegistry(registry: Registry, query: RegistryQuery) {
  if (query.tag !== undefined && !(query.tag in registry.tags))
    throw new Error(
      `Unknown tag. Use one of: ${Object.keys(registry.tags).join(", ")}.`,
    );
  const words = (query.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return registry.entries.filter((entry) => {
    if (query.kind && entry.kind !== query.kind) return false;
    if (query.tag && !entry.tags.includes(query.tag)) return false;
    const haystack =
      `${entry.name} ${String(entry.title ?? "")} ${entry.description}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function registryTools(file = registryPath()): ToolDefinition[] {
  return [
    {
      name: "genobi_registry",
      title: "Genobi registry",
      description:
        "Search every Genobi tool and skill by tag or text. With no arguments, list the tags and the tools and skills under each. With tag, text or kind, return the matching entries: description, tags and linked docs, for a tool whether it is read-only or paid and which skills teach it, for a skill which tools it uses. Reads the plugin's registry file only; never pays.",
      inputSchema: {
        tag: z
          .string()
          .regex(TAG)
          .optional()
          .describe("A tag from the list, for example sound or director"),
        text: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe("Words that must all appear in the name or description"),
        kind: z.enum(["tool", "skill"]).optional(),
      },
      tags: ["agents", "mcp", "wiki"],
      docs: ["docs/registry.md", "plugins/genobi/README.md"],
      annotations: { readOnlyHint: true, idempotentHint: true },
      async run(_api, args) {
        const registry = readRegistry(file);
        const query = args as RegistryQuery;
        if (!query.tag && !query.text && !query.kind)
          return { tags: registry.tags };
        return { entries: searchRegistry(registry, query) };
      },
    },
  ];
}

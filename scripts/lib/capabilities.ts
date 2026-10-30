// The capability map: plugins/genobi/capabilities.json, one entry per feature
// with where it lives, the MCP tools, CLI verbs, skills and docs that serve it,
// where it runs and on which models, and its status. The file is hand-kept;
// this module checks it against the generated tool and skill registry and the
// repository, so a renamed tool, a missing doc or an unbacked "verified" fails.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { githubSlug, parseFrontmatter } from "./wiki.mjs";

export const CAPABILITIES_FILE = "plugins/genobi/capabilities.json";
export const CAPABILITIES_PAGE = "docs/capabilities.md";
const REGISTRY_FILE = "plugins/genobi/registry.json";
/** Repository skills outside the plugin (`.agents/skills/<name>/SKILL.md`). */
const REPO_SKILLS = ".agents/skills";

export const AREAS = [
  "Gallery",
  "Camera",
  "Director",
  "Editor",
  "3D",
  "Dual Swords",
  "Scrolls",
  "Project Tools",
  "Setup",
  "Studio",
  "Agents",
  "Comfy",
  "Hosted",
] as const;
export const ROUTES = [
  "local-free",
  "local-model",
  "comfy-cloud",
  "paid-api",
] as const;
export const STATUSES = ["verified", "implemented", "planned"] as const;
export const WEIGHTS = ["open", "closed", "api"] as const;
/** CLI commands that are not MCP tools (`cli/run.ts`). */
export const BUILTIN_VERBS = [
  "help",
  "tools",
  "schema",
  "call",
  "profile",
  "capabilities",
];

export type Route = (typeof ROUTES)[number];
export type Status = (typeof STATUSES)[number];
export type Weights = (typeof WEIGHTS)[number];
export interface Run {
  route: Route;
  models?: string[];
}
export interface Capability {
  id: string;
  name: string;
  description: string;
  where: string;
  mcp: string[];
  cli: string[];
  skills: string[];
  docs: string[];
  runs: Run[];
  status: Status;
  /** "YYYY-MM-DD path#anchor": the dated record, for "verified" only. */
  evidence?: string;
}
export interface CapabilityMap {
  about: string;
  routes: Record<Route, string>;
  statuses: Record<Status, string>;
  weights: Record<Weights, string>;
  models: Record<string, { name: string; weights: Weights }>;
  capabilities: Capability[];
}

const FIELDS = [
  "id",
  "name",
  "description",
  "where",
  "mcp",
  "cli",
  "skills",
  "docs",
  "runs",
  "status",
  "evidence",
];
const EVIDENCE = /^(\d{4})-(\d{2})-(\d{2}) ([^\s#]+)#([^\s#]+)$/;

/** The area a capability sits in: the text before " · " in `where`. */
export const areaOf = (entry: Pick<Capability, "where">) =>
  entry.where.split(" · ")[0];

/** Parses an evidence pointer; null when it is not "YYYY-MM-DD path#anchor". */
export function parseEvidence(evidence: string) {
  const match = EVIDENCE.exec(evidence);
  if (!match) return null;
  const [, year, month, day, file, anchor] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day))
    return null;
  return { date: `${year}-${month}-${day}`, file, anchor };
}

const isRepoFile = (root: string, file: string) => {
  const target = path.join(root, file);
  return (
    !path.isAbsolute(file) &&
    !path.relative(root, target).startsWith("..") &&
    existsSync(target) &&
    statSync(target).isFile()
  );
};

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The text of one section, from its heading to the next heading at the same
 * or a higher level, or null when the page has no such anchor. Anchors follow
 * GitHub, repeats included (`-1`, `-2`); headings inside code fences do not count.
 */
export function sectionText(body: string, anchor: string): string | null {
  const lines = body.split("\n");
  const seen = new Map<string, number>();
  let fenced = false;
  let start = -1;
  let level = 0;
  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^(#{1,6}) +(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (!heading) continue;
    if (start >= 0 && heading[1].length <= level)
      return lines.slice(start, index).join("\n");
    const base = githubSlug(heading[2]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (start < 0 && (count ? `${base}-${count}` : base) === anchor) {
      start = index;
      level = heading[1].length;
    }
  }
  return start >= 0 ? lines.slice(start).join("\n") : null;
}

/** Whether text names an ISO date as itself or as "29 October 2026". */
export function mentionsDate(text: string, iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return (
    text.includes(iso) ||
    new RegExp(`\\b${day} ${MONTHS[month - 1]} ${year}\\b`).test(text)
  );
}

/** The tools and skills the generated registry lists. */
export function readRegistry(root: string) {
  const registry = JSON.parse(
    readFileSync(path.join(root, REGISTRY_FILE), "utf8"),
  ) as { entries: { kind: string; name: string }[] };
  const names = (kind: string) =>
    registry.entries
      .filter((entry) => entry.kind === kind)
      .map((entry) => entry.name);
  return { tools: names("tool"), skills: names("skill") };
}

/** The MCP tool a CLI verb runs, or null for a built-in command. */
export function verbTool(verb: string) {
  const words = verb.trim().split(/\s+/);
  if (words.length === 1 && BUILTIN_VERBS.includes(words[0])) return null;
  // `genobi swords trim` is an alias of `genobi media trim` (cli/commands.ts).
  const name = words
    .join("_")
    .replaceAll("-", "_")
    .replace(/^swords_/, "media_");
  return `genobi_${name}`;
}

/** Every problem with the map; empty when it is consistent. */
export function checkCapabilities(
  root: string,
  map: CapabilityMap,
  registry = readRegistry(root),
): string[] {
  const problems: string[] = [];
  const tools = new Set(registry.tools);
  const skills = new Set(registry.skills);
  const repoSkill = (name: string) =>
    /^[a-z0-9-]+$/.test(name) &&
    isRepoFile(root, `${REPO_SKILLS}/${name}/SKILL.md`);
  const models = map.models ?? {};
  for (const [id, model] of Object.entries(models)) {
    if (typeof model?.name !== "string" || !model.name)
      problems.push(`model ${id}: no name`);
    if (!(WEIGHTS as readonly string[]).includes(model?.weights))
      problems.push(
        `model ${id}: weights must be one of ${WEIGHTS.join(", ")}`,
      );
  }
  for (const key of ROUTES)
    if (typeof map.routes?.[key] !== "string")
      problems.push(`routes: no meaning for ${key}`);
  for (const key of STATUSES)
    if (typeof map.statuses?.[key] !== "string")
      problems.push(`statuses: no meaning for ${key}`);
  for (const key of WEIGHTS)
    if (typeof map.weights?.[key] !== "string")
      problems.push(`weights: no meaning for ${key}`);
  if (!Array.isArray(map.capabilities)) return [...problems, "no capabilities"];

  const ids = new Set<string>();
  const names = new Set<string>();
  const usedModels = new Set<string>();
  const namedTools = new Set<string>();
  const namedSkills = new Set<string>();
  for (const [index, entry] of map.capabilities.entries()) {
    const where = `capability ${entry?.id ?? index}`;
    for (const key of Object.keys(entry ?? {}))
      if (!FIELDS.includes(key))
        problems.push(`${where}: unknown field ${key}`);
    for (const key of ["id", "name", "description", "where"] as const)
      if (typeof entry?.[key] !== "string" || !entry[key].trim())
        problems.push(`${where}: ${key} must be a non-empty string`);
    for (const key of ["mcp", "cli", "skills", "docs"] as const)
      if (!strings(entry?.[key]))
        problems.push(`${where}: ${key} must be a list of strings`);
    if (problems.some((problem) => problem.startsWith(`${where}:`))) continue;

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id))
      problems.push(`${where}: id must be lower-case words joined by hyphens`);
    if (ids.has(entry.id)) problems.push(`${where}: repeated id`);
    ids.add(entry.id);
    if (names.has(entry.name)) problems.push(`${where}: repeated name`);
    names.add(entry.name);
    if (!(AREAS as readonly string[]).includes(areaOf(entry)))
      problems.push(
        `${where}: where must start with an area and " · " (${AREAS.join(", ")})`,
      );

    for (const tool of entry.mcp) {
      namedTools.add(tool);
      if (!tools.has(tool)) problems.push(`${where}: unknown MCP tool ${tool}`);
    }
    for (const verb of entry.cli) {
      const tool = verbTool(verb);
      if (tool === null) continue;
      if (!tools.has(tool))
        problems.push(`${where}: CLI verb "${verb}" names no tool or command`);
      else if (!entry.mcp.includes(tool))
        problems.push(`${where}: CLI verb "${verb}" runs ${tool}, not listed`);
    }
    for (const skill of entry.skills) {
      namedSkills.add(skill);
      if (!skills.has(skill) && !repoSkill(skill))
        problems.push(`${where}: unknown skill ${skill}`);
    }
    if (!entry.docs.length) problems.push(`${where}: no docs`);
    for (const doc of entry.docs)
      if (doc !== CAPABILITIES_PAGE && !isRepoFile(root, doc))
        problems.push(`${where}: doc ${doc} is not a repository file`);

    if (!Array.isArray(entry.runs) || !entry.runs.length)
      problems.push(`${where}: runs must name at least one route`);
    for (const run of Array.isArray(entry.runs) ? entry.runs : []) {
      if (!(ROUTES as readonly string[]).includes(run?.route)) {
        problems.push(
          `${where}: route ${run?.route} is not one of ${ROUTES.join(", ")}`,
        );
        continue;
      }
      const ran = run.models ?? [];
      if (!strings(ran)) problems.push(`${where}: models must be model ids`);
      else if (run.route === "local-free" && ran.length)
        problems.push(`${where}: local-free names no model`);
      else if (run.route !== "local-free" && !ran.length)
        problems.push(`${where}: ${run.route} must name its models`);
      for (const model of strings(ran) ? ran : []) {
        usedModels.add(model);
        if (!(model in models))
          problems.push(`${where}: unknown model ${model}`);
      }
    }

    if (!(STATUSES as readonly string[]).includes(entry.status))
      problems.push(
        `${where}: status ${entry.status} is not one of ${STATUSES.join(", ")}`,
      );
    if (entry.status === "verified") {
      const evidence =
        typeof entry.evidence === "string"
          ? parseEvidence(entry.evidence)
          : null;
      if (!evidence)
        problems.push(
          `${where}: verified needs evidence "YYYY-MM-DD path#section"`,
        );
      else if (!isRepoFile(root, evidence.file))
        problems.push(`${where}: evidence ${evidence.file} does not exist`);
      else {
        const { body } = parseFrontmatter(
          readFileSync(path.join(root, evidence.file), "utf8"),
        );
        const section = sectionText(body, evidence.anchor);
        if (section === null)
          problems.push(
            `${where}: evidence ${evidence.file} has no section #${evidence.anchor}`,
          );
        else if (!mentionsDate(section, evidence.date))
          problems.push(
            `${where}: evidence section #${evidence.anchor} does not name ${evidence.date}`,
          );
      }
    } else if (entry.evidence !== undefined)
      problems.push(`${where}: evidence belongs to verified entries only`);
  }

  for (const tool of registry.tools)
    if (!namedTools.has(tool))
      problems.push(`registry tool ${tool} is in no capability`);
  for (const skill of registry.skills)
    if (!namedSkills.has(skill))
      problems.push(`registry skill ${skill} is in no capability`);
  for (const model of Object.keys(models))
    if (!usedModels.has(model))
      problems.push(`model ${model} is used by no capability`);
  return problems;
}

/** Reads the committed map. */
export const readCapabilities = (root: string) =>
  JSON.parse(
    readFileSync(path.join(root, CAPABILITIES_FILE), "utf8"),
  ) as CapabilityMap;

/** A value on one line: `["a", "b"]`, `{ "route": "local-free" }`. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value && typeof value === "object") {
    const pairs = Object.entries(value).map(
      ([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`,
    );
    return pairs.length ? `{ ${pairs.join(", ")} }` : "{}";
  }
  return JSON.stringify(value);
}

/** Keys of one capability, grouped onto lines in this order. */
const LINES = [
  ["id", "name", "status", "evidence"],
  ["where"],
  ["description"],
  ["mcp", "cli"],
  ["skills", "docs"],
  ["runs"],
];

/**
 * The committed layout: a capability takes about eight lines, its lists on
 * one line each, so the whole map stays readable and short. Prettier skips
 * the file; `npm run capabilities` writes this layout and the check holds to it.
 */
export function serializeCapabilities(map: CapabilityMap): string {
  const block = (record: Record<string, unknown>, indent: string) =>
    Object.entries(record)
      .map(
        ([key, value]) => `${indent}${JSON.stringify(key)}: ${inline(value)}`,
      )
      .join(",\n");
  const known = new Set(LINES.flat());
  const capability = (entry: Capability) => {
    const record = entry as unknown as Record<string, unknown>;
    const lines = [
      ...LINES.map((keys) => keys.filter((key) => key in record)),
      // Unknown fields are kept (and reported by the check), never dropped.
      ...Object.keys(record)
        .filter((key) => !known.has(key))
        .map((key) => [key]),
    ]
      .filter((keys) => keys.length)
      .map(
        (keys) =>
          `      ${keys.map((key) => `${JSON.stringify(key)}: ${inline(record[key])}`).join(", ")}`,
      );
    return `    {\n${lines.join(",\n")}\n    }`;
  };
  return [
    "{",
    `  "about": ${JSON.stringify(map.about)},`,
    `  "routes": {\n${block(map.routes, "    ")}\n  },`,
    `  "statuses": {\n${block(map.statuses, "    ")}\n  },`,
    `  "weights": {\n${block(map.weights, "    ")}\n  },`,
    `  "models": {\n${block(map.models, "    ")}\n  },`,
    `  "capabilities": [\n${map.capabilities.map(capability).join(",\n")}\n  ]`,
    "}",
    "",
  ].join("\n");
}

// Reads the docs/ wiki: frontmatter, titles, relative links and heading
// anchors. Pure functions over text plus one directory walk; no dependencies,
// so the check runs before anything is built.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";

const unquote = (value, where) => {
  if (value.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(value))
      throw new Error(`${where}: unterminated double-quoted string`);
    return JSON.parse(value);
  }
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(value))
      throw new Error(`${where}: unterminated single-quoted string`);
    return value.slice(1, -1).replaceAll("''", "'");
  }
  // A plain scalar cannot hold ": " or " #" in YAML; quote the value instead.
  if (/: | #/.test(value))
    throw new Error(`${where}: quote a value that contains ": " or " #"`);
  return value;
};

const flowList = (source, where) => {
  if (!source.endsWith("]")) throw new Error(`${where}: unclosed [ list`);
  const inner = source.slice(1, -1).trim();
  return inner
    ? inner.split(",").map((item) => unquote(item.trim(), where))
    : [];
};

/**
 * Splits leading YAML frontmatter from a page. Accepts the subset the wiki
 * uses: `key: scalar`, `key: [a, b]` (one or more lines) and `key:` followed
 * by `- item` lines. Anything else is an error rather than a silent guess.
 */
export function parseFrontmatter(text) {
  const source = text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(source);
  if (!match) return { data: null, body: source };
  const data = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const pair = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!pair)
      throw new Error(`frontmatter line ${i + 2}: expected key: value`);
    const [, key, raw = ""] = pair;
    const where = `frontmatter ${key}`;
    let value = raw.trim();
    if (!value) {
      // Either a block list or a flow list that starts on the next line.
      const items = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        const next = lines[++i].trim();
        if (next.startsWith("[")) value += next;
        else if (value) value += " " + next;
        else if (next.startsWith("- "))
          items.push(unquote(next.slice(2).trim(), where));
        else throw new Error(`${where}: expected "- item"`);
      }
      data[key] = value ? flowList(value, where) : items;
      continue;
    }
    if (value.startsWith("[")) {
      while (
        !value.endsWith("]") &&
        i + 1 < lines.length &&
        /^\s/.test(lines[i + 1])
      )
        value += " " + lines[++i].trim();
      data[key] = flowList(value, where);
    } else data[key] = unquote(value, where);
  }
  return { data, body: source.slice(match[0].length) };
}

/**
 * Blanks fenced code blocks, and inline code spans unless `inline` is false,
 * so their contents are not read as headings or links.
 */
export function stripCode(body, { inline = true } = {}) {
  const out = [];
  let fence = null;
  for (const line of body.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length)
        fence = null;
      out.push("");
    } else if (marker) {
      fence = marker;
      out.push("");
    } else out.push(inline ? line.replace(/(`+)[\s\S]*?\1/g, "") : line);
  }
  return out.join("\n");
}

/** The first level-one heading, as plain text. */
export function pageTitle(body) {
  const heading = /^# +(.+?)(?:\s+#+)?\s*$/m.exec(
    stripCode(body, { inline: false }),
  );
  return heading ? plainText(heading[1]) : null;
}

const plainText = (markdown) =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*~]/g, "")
    .trim();

/** GitHub's anchor for a heading: lowercase, punctuation dropped, spaces to hyphens. */
export function githubSlug(heading) {
  return plainText(heading)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/** Every anchor a page offers, including GitHub's -1, -2 suffixes for repeats. */
export function headingAnchors(body) {
  const anchors = new Set();
  const seen = new Map();
  for (const [, text] of stripCode(body, { inline: false }).matchAll(
    /^#{1,6} +(.+?)(?:\s+#+)?\s*$/gm,
  )) {
    const base = githubSlug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count ? `${base}-${count}` : base);
  }
  return anchors;
}

/** Relative link targets: inline links, images and reference definitions. */
export function relativeLinks(body) {
  const text = stripCode(body);
  const targets = [
    ...[
      ...text.matchAll(
        /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'(][^)]*)?\)/g,
      ),
    ].map((m) => m[1]),
    ...[...text.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/gm)].map(
      (m) => m[1],
    ),
  ];
  return targets
    .map((target) => target.replace(/^<|>$/g, ""))
    .filter(
      (target) =>
        target &&
        !/^[a-z][a-z\d+.-]*:/i.test(target) &&
        !target.startsWith("/"),
    );
}

/**
 * Links to this repository's files on GitHub (`<repoUrl>blob/<ref>/<path>`),
 * as repository-relative paths without their anchors.
 */
export function repoLinks(body, repoUrl) {
  const prefix = repoUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${prefix}(?:blob|tree)/[^/\\s)]+/([^\\s)#>]+)`,
    "g",
  );
  return [...stripCode(body).matchAll(pattern)].map((m) =>
    decodeURIComponent(m[1]),
  );
}

/** Tags defined in docs/tags.md: the first cell of each table row, in backticks. */
export function tagVocabulary(markdown) {
  const tags = new Map();
  for (const [, tag, meaning] of markdown.matchAll(
    /^\|\s*`([a-z0-9-]+)`\s*\|\s*(.*?)\s*\|\s*$/gm,
  ))
    tags.set(tag, meaning);
  return tags;
}

const toPosix = (path) => path.split(sep).join("/");

/** Markdown files under the wiki root, as sorted root-relative POSIX paths. */
export function wikiPages(root) {
  return readdirSync(root, { recursive: true })
    .map((path) => toPosix(String(path)))
    .filter(
      (path) => path.endsWith(".md") && statSync(join(root, path)).isFile(),
    )
    .sort();
}

/**
 * Reads every page under `root` and returns the agent index plus a list of
 * problems: missing frontmatter, unknown tags, empty summaries, broken
 * relative links or anchors, and pages the wiki home does not link.
 */
export function buildWikiIndex(
  root,
  { home = "README.md", tagsPage = "tags.md", repoUrl } = {},
) {
  const problems = [];
  const vocabulary = existsSync(join(root, tagsPage))
    ? tagVocabulary(readFileSync(join(root, tagsPage), "utf8"))
    : new Map();
  if (!vocabulary.size) problems.push(`${tagsPage}: no tags defined`);
  const paths = wikiPages(root);
  const parsed = new Map();
  for (const path of paths) {
    const text = readFileSync(join(root, path), "utf8");
    try {
      parsed.set(path, parseFrontmatter(text));
    } catch (error) {
      problems.push(`${path}: ${error.message}`);
      parsed.set(path, { data: null, body: text });
    }
  }
  const anchorCache = new Map();
  const anchorsOf = (file) => {
    if (!anchorCache.has(file)) {
      const key = toPosix(relative(root, file));
      const body =
        parsed.get(key)?.body ??
        parseFrontmatter(readFileSync(file, "utf8")).body;
      anchorCache.set(file, headingAnchors(body));
    }
    return anchorCache.get(file);
  };

  const pages = [];
  const linkedFromHome = new Set();
  for (const path of paths) {
    const { data, body } = parsed.get(path);
    const tags = Array.isArray(data?.tags) ? data.tags : [];
    const summary =
      typeof data?.summary === "string" ? data.summary.trim() : "";
    if (!data) problems.push(`${path}: no frontmatter (tags and summary)`);
    else {
      if (!tags.length) problems.push(`${path}: no tags`);
      for (const tag of tags)
        if (!vocabulary.has(tag))
          problems.push(`${path}: tag "${tag}" is not in ${tagsPage}`);
      if (new Set(tags).size !== tags.length)
        problems.push(`${path}: repeated tag`);
      if (!summary) problems.push(`${path}: no summary`);
    }
    if (path.startsWith("archive/") && data && !tags.includes("archive"))
      problems.push(`${path}: archived page without the archive tag`);

    const links = new Set();
    for (const target of relativeLinks(body)) {
      const [rawPath, anchor] = target.split("#", 2);
      let decoded;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        problems.push(`${path}: malformed link ${target}`);
        continue;
      }
      const file = decoded
        ? join(root, dirname(path), decoded)
        : join(root, path);
      // An Obsidian vault opened at the wiki root cannot follow a link out of it.
      if (relative(root, file).startsWith("..")) {
        problems.push(
          `${path}: ${target} leaves the wiki; link the file on GitHub instead`,
        );
        continue;
      }
      if (!existsSync(file)) {
        problems.push(`${path}: broken link ${target}`);
        continue;
      }
      if (
        anchor &&
        file.endsWith(".md") &&
        !anchorsOf(file).has(anchor.toLowerCase())
      )
        problems.push(`${path}: broken anchor ${target}`);
      const page = toPosix(relative(root, file));
      if (decoded && parsed.has(page) && page !== path) links.add(page);
    }
    if (repoUrl)
      for (const file of repoLinks(body, repoUrl))
        if (!existsSync(join(root, "..", file)))
          problems.push(`${path}: GitHub link to missing file ${file}`);
    if (path === home) for (const page of links) linkedFromHome.add(page);
    pages.push({
      title: pageTitle(body) ?? posix.basename(path, ".md"),
      path,
      tags,
      summary,
      links: [...links].sort(),
    });
  }
  if (!parsed.has(home)) problems.push(`${home}: the wiki home is missing`);
  else
    for (const path of paths)
      if (path !== home && !linkedFromHome.has(path))
        problems.push(`${path}: not linked from the wiki home (${home})`);

  const byTag = {};
  for (const [tag, meaning] of vocabulary)
    byTag[tag] = {
      meaning,
      pages: pages
        .filter((page) => page.tags.includes(tag))
        .map((page) => page.path),
    };
  return { index: { tags: byTag, pages }, problems };
}

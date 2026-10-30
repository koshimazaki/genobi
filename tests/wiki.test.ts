import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildWikiIndex,
  githubSlug,
  headingAnchors,
  pageTitle,
  parseFrontmatter,
  relativeLinks,
  repoLinks,
  tagVocabulary,
} from "../scripts/lib/wiki.mjs";

describe("wiki frontmatter", () => {
  it("reads flow and block tag lists, plain and quoted summaries", () => {
    expect(
      parseFrontmatter(
        "---\ntags: [plan, comfy]\nsummary: One line.\n---\n\n# T\n",
      ),
    ).toEqual({
      data: { tags: ["plan", "comfy"], summary: "One line." },
      body: "\n# T\n",
    });
    expect(
      parseFrontmatter(
        '---\ntags:\n  - plan\n  - "3d"\nsummary: "Quoted: with a colon"\n---\n',
      ).data,
    ).toEqual({ tags: ["plan", "3d"], summary: "Quoted: with a colon" });
    // Prettier wraps a long flow list onto the next line.
    expect(
      parseFrontmatter("---\ntags:\n  [plan, comfy,\n  ltx]\n---\n").data,
    ).toEqual({
      tags: ["plan", "comfy", "ltx"],
    });
  });

  it("treats a page without a leading block as untagged", () => {
    expect(parseFrontmatter("﻿---\r\ntags: [plan]\r\n---\r\n").data).toEqual({
      tags: ["plan"],
    });
    expect(
      parseFrontmatter("# Title\n\n---\ntags: [plan]\n---\n").data,
    ).toBeNull();
  });

  it("refuses YAML the wiki subset would misread", () => {
    expect(() => parseFrontmatter("---\nsummary: A: B\n---\n")).toThrow(
      /quote/,
    );
    expect(() => parseFrontmatter("---\ntags: [plan\n---\n")).toThrow(
      /unclosed/,
    );
    expect(() => parseFrontmatter("---\njust text\n---\n")).toThrow(
      /key: value/,
    );
  });
});

describe("wiki Markdown", () => {
  it("finds the title and relative links outside code", () => {
    const body = [
      "# The `Genobi` plan",
      "[a](vision.md) [b](https://example.com) ![c](img/x.png 'title') [d](#local)",
      "`[e](inline.md)`",
      "```md",
      "[f](fenced.md)",
      "```",
      "[ref]: ../AGENTS.md",
    ].join("\n");
    expect(pageTitle(body)).toBe("The Genobi plan");
    expect(relativeLinks(body)).toEqual([
      "vision.md",
      "img/x.png",
      "#local",
      "../AGENTS.md",
    ]);
  });

  it("makes GitHub heading anchors, numbering repeats", () => {
    expect(githubSlug("Acoustic Space (AKUSPACE)")).toBe(
      "acoustic-space-akuspace",
    );
    expect(githubSlug("Part three: 3D, animation and sound")).toBe(
      "part-three-3d-animation-and-sound",
    );
    expect(githubSlug("The `director.bundle.v1` format")).toBe(
      "the-directorbundlev1-format",
    );
    expect([
      ...headingAnchors("## Checks\n### Checks\n```\n# not a heading\n```"),
    ]).toEqual(["checks", "checks-1"]);
  });

  it("reads links to this repository's files on GitHub", () => {
    const url = "https://github.com/acme/app/";
    expect(
      repoLinks(
        `[a](${url}blob/main/src/a.ts#L3) [b](${url}tree/dev/docs) ` +
          "[c](https://github.com/other/app/blob/main/x.ts) `" +
          `${url}blob/main/in-code.ts\``,
        url,
      ),
    ).toEqual(["src/a.ts", "docs"]);
  });

  it("reads the tag vocabulary from the tags table", () => {
    expect([
      ...tagVocabulary(
        "| Tag | Means |\n| --- | --- |\n| `plan` | Plans |\n| `3d` | Scenes |\n",
      ),
    ]).toEqual([
      ["plan", "Plans"],
      ["3d", "Scenes"],
    ]);
  });
});

describe("wiki index and check", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const wiki = (files: Record<string, string>) => {
    root = mkdtempSync(join(tmpdir(), "wiki-"));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return buildWikiIndex(root);
  };
  const page = (tags: string, body: string) =>
    `---\ntags: [${tags}]\nsummary: S.\n---\n\n${body}\n`;
  const tags = page(
    "wiki",
    "# Tags\n\n| `wiki` | W |\n| `plan` | P |\n| `archive` | A |",
  );

  it("indexes titles, tags, summaries and wiki links", () => {
    const { index, problems } = wiki({
      "README.md": page(
        "wiki",
        "# Home\n\n[Plan](plan.md#scope) [Tags](tags.md)",
      ),
      "tags.md": tags,
      "plan.md": page(
        "plan",
        "# Plan\n\n## Scope\n\n[home](README.md) [code](tags.md)",
      ),
    });
    expect(problems).toEqual([]);
    expect(index.pages.find((p) => p.path === "plan.md")).toEqual({
      title: "Plan",
      path: "plan.md",
      tags: ["plan"],
      summary: "S.",
      links: ["README.md", "tags.md"],
    });
    expect(index.tags.plan).toEqual({ meaning: "P", pages: ["plan.md"] });
  });

  it("reports untagged pages, unknown tags, broken links and orphans", () => {
    const { problems } = wiki({
      "README.md": page(
        "wiki",
        "# Home\n\n[Tags](tags.md) [Gone](gone.md) [A](plan.md#nope)",
      ),
      "tags.md": tags,
      "plan.md": "# Plan\n",
      "archive/old.md": page("bogus", "# Old"),
    });
    expect(problems).toEqual([
      "README.md: broken link gone.md",
      "README.md: broken anchor plan.md#nope",
      'archive/old.md: tag "bogus" is not in tags.md',
      "archive/old.md: archived page without the archive tag",
      "plan.md: no frontmatter (tags and summary)",
      "archive/old.md: not linked from the wiki home (README.md)",
    ]);
  });

  it("keeps links inside the vault and checks GitHub links to repo files", () => {
    const repo = mkdtempSync(join(tmpdir(), "wiki-repo-"));
    root = repo;
    const url = "https://github.com/acme/app/";
    const files: Record<string, string> = {
      "src/app.ts": "",
      "docs/tags.md": tags,
      "docs/README.md": page(
        "wiki",
        "# Home\n\n[Tags](tags.md) [Up](../src/app.ts) " +
          `[Code](${url}blob/main/src/app.ts#L1) [Gone](${url}blob/main/src/gone.ts)`,
      ),
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }
    expect(
      buildWikiIndex(join(repo, "docs"), { repoUrl: url }).problems,
    ).toEqual([
      "README.md: ../src/app.ts leaves the wiki; link the file on GitHub instead",
      "README.md: GitHub link to missing file src/gone.ts",
    ]);
  });
});

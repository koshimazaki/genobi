import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GenobiApi } from "../mcp/api";
import {
  MAX_INDEX_BYTES,
  MAX_PAGE_CHARS,
  docsRoot,
  docsTools,
  type WikiPage,
} from "../mcp/docs-tools";
import { tools } from "../mcp/tools";
import { GENOBI_TOOLS } from "../server/agent-runner";

const root = path.resolve("docs");
const [tool] = docsTools(root);
// The tool reads wiki files only; a studio client it never uses stands in.
const api = {} as GenobiApi;
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true });
});
const temp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "genobi-docs-"));
  temps.push(dir);
  return dir;
};
const pages = async (args: Record<string, unknown>) =>
  ((await tool.run(api, args)) as { pages: WikiPage[] }).pages;

describe("genobi_docs", () => {
  it("is a read-only tool a studio session may call", () => {
    const registered = tools.find((t) => t.name === "genobi_docs");
    expect(registered?.annotations.readOnlyHint).toBe(true);
    expect(registered?.paid).toBeUndefined();
    expect(GENOBI_TOOLS).toContain("genobi_docs");
  });

  it("finds the wiki from the bundled server and from mcp/", () => {
    expect(docsRoot(path.resolve("plugins/genobi/server"))).toBe(root);
    expect(docsRoot(path.resolve("mcp"))).toBe(root);
  });

  it("lists tags, then finds pages by tag and by words", async () => {
    const { tags } = (await tool.run(api, {})) as {
      tags: Record<string, { meaning: string; pages: number }>;
    };
    expect(tags.storyboard.pages).toBeGreaterThan(0);
    expect((await pages({ tag: "storyboard" })).map((p) => p.path)).toContain(
      "scrolls.md",
    );
    const found = await pages({ text: "run location" });
    expect(found.length).toBeGreaterThan(0);
    for (const page of found)
      expect(
        `${page.title} ${page.summary} ${page.path}`.toLowerCase(),
      ).toContain("location");
    await expect(tool.run(api, { tag: "no-such-tag" })).rejects.toThrow(
      /Unknown tag/,
    );
  });

  it("reads a page the index lists, and nothing else", async () => {
    const page = (await tool.run(api, { page: "scrolls.md" })) as {
      text: string;
      url: string;
      truncated: boolean;
    };
    expect(page.text).toContain("Scrolls");
    expect(page.url).toMatch(/blob\/main\/docs\/scrolls\.md$/);
    for (const escape of ["../AGENTS.md", "/etc/passwd", "index.json"])
      await expect(tool.run(api, { page: escape })).rejects.toThrow(
        /No such page/,
      );
  });

  it("cuts a long page, and refuses a missing or oversized index", async () => {
    const dir = temp();
    writeFileSync(
      path.join(dir, "index.json"),
      JSON.stringify({
        tags: { wiki: { meaning: "w", pages: ["long.md"] } },
        pages: [
          { title: "Long", path: "long.md", tags: ["wiki"], summary: "" },
        ],
      }),
    );
    writeFileSync(path.join(dir, "long.md"), "x".repeat(MAX_PAGE_CHARS + 10));
    const long = (await docsTools(dir)[0].run(api, { page: "long.md" })) as {
      text: string;
      truncated: boolean;
    };
    expect(long.truncated).toBe(true);
    expect(long.text).toHaveLength(MAX_PAGE_CHARS);
    await expect(docsTools(temp())[0].run(api, {})).rejects.toThrow(
      /wiki index is not here/,
    );
    const big = temp();
    writeFileSync(
      path.join(big, "index.json"),
      " ".repeat(MAX_INDEX_BYTES + 1),
    );
    await expect(docsTools(big)[0].run(api, {})).rejects.toThrow(
      /wiki index is not here/,
    );
  });
});

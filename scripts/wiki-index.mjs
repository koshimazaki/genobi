// Writes docs/index.json, the agent index of the wiki: title, path, tags,
// summary and wiki links for every page, plus the pages under each tag.
// `--check` writes nothing and fails on a page without tags or summary, an
// unknown tag, a broken relative link or anchor, a relative link that leaves
// docs/ (an Obsidian vault there cannot follow it), a GitHub link to a file the
// repository does not have, a page the wiki home does not link, or an index
// that no longer matches the pages.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { buildWikiIndex } from "./lib/wiki.mjs";

const docs = fileURLToPath(new URL("../docs/", import.meta.url));
const target = new URL("../docs/index.json", import.meta.url);
const { index, problems } = buildWikiIndex(docs, {
  repoUrl: "https://github.com/koshimazaki/Genobi/",
});
if (problems.length) {
  console.error(`Wiki problems (${problems.length}):`);
  for (const problem of problems) console.error(`  docs/${problem}`);
  process.exit(1);
}
const json = await format(
  JSON.stringify({
    generated:
      "By scripts/wiki-index.mjs; run npm run wiki:index. Paths are relative to docs/.",
    ...index,
  }),
  { filepath: fileURLToPath(target) },
);
if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== json) {
    console.error("docs/index.json is stale. Run npm run wiki:index.");
    process.exit(1);
  }
  console.log(`Wiki check passed: ${index.pages.length} pages, index current.`);
} else {
  await writeFile(target, json);
  console.log(`Wrote docs/index.json: ${index.pages.length} pages.`);
}

// Builds a showcase project's versions (docs/director-bundle/showcase/):
// for every version listed in <project>/memory.json, the cut, the template
// and mixProject exactly as they were at that version's commit, built into
// project-v<N>.json, and the record's `media` map: each file the versions
// use, by SHA-256, with its bundle path and the public URL that serves those
// bytes. When today's public/ no longer holds them, a record with `archive`
// gets a copy under public/media/showcase/<project>/v<N>/; otherwise the
// entry says where git keeps them. Reads git only; writes the showcase
// folder. `node --import tsx scripts/showcase-versions.mjs <project> [--check]`
// (--check: fail if a file would change).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";

const [slug, flag] = process.argv.slice(2);
assert.match(slug ?? "", /^[a-z][a-z0-9-]{0,63}$/, "Name a showcase project");
const check = flag === "--check";
const dir = `docs/director-bundle/showcase/${slug}`;
const recordPath = `${dir}/memory.json`;
const record = JSON.parse(await readFile(recordPath, "utf8"));
const git = (args, encoding) =>
  execFileSync("git", args, { maxBuffer: 256 * 1024 * 1024, encoding });
const show = (commit, file, encoding) =>
  git(["show", `${commit}:${file}`], encoding);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Written as Prettier writes it, so format:check and --check agree.
const json = async (value, file) =>
  format(JSON.stringify(value), {
    ...(await resolveConfig(file)),
    filepath: file,
  });

const media = {};
const written = [];
const changed = [];
const put = async (file, text) => {
  written.push(file);
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (before === text) return;
  changed.push(file);
  if (!check) await writeFile(file, text);
};

const trusted = JSON.parse(
  await readFile("docs/director-bundle/example/studio.json", "utf8"),
).modules;
const scratch = await mkdtemp(path.join(tmpdir(), "showcase-"));
try {
  for (const version of record.versions) {
    const { commit, version: n } = version;
    if (!commit) {
      const frozen = JSON.parse(
        await readFile(`${dir}/${version.file}`, "utf8"),
      );
      for (const asset of Object.values(frozen.assets)) {
        const digest = asset.file.sha256;
        const entry = record.media[digest];
        assert.ok(entry, `v${n}: missing media record`);
        if (entry.url)
          assert.equal(sha(readFileSync(`public${entry.url}`)), digest);
        media[digest] = entry;
      }
      written.push(`${dir}/${version.file}`);
      continue;
    }
    // The template's own sources at that commit, imported as they were.
    const root = path.join(scratch, `v${n}`, "shared", "templates");
    await mkdir(root, { recursive: true });
    for (const file of [
      `${record.template}.ts`,
      `${record.template}.cut.json`,
      "mix.ts",
    ])
      await writeFile(
        path.join(root, file),
        show(commit, `shared/templates/${file}`),
      );
    const templateModule = await import(
      pathToFileURL(path.join(root, `${record.template}.ts`)).href
    );
    const { mixProject } = await import(
      pathToFileURL(path.join(root, "mix.ts")).href
    );
    const template = Object.values(templateModule).find(
      (t) => t && typeof t === "object" && t.id === record.template && t.mix,
    );
    assert.ok(template, `${commit}: no ${record.template} mix template`);
    const registry = JSON.parse(
      show(commit, "docs/director-bundle/example/studio.json", "utf8"),
    );
    const files = {};
    for (const [id, m] of Object.entries(template.mix.media)) {
      const bytes = show(commit, `public${m.url}`);
      const digest = sha(bytes);
      files[id] = { ...m, sha256: digest };
      if (media[digest]) continue;
      const now = existsSync(`public${m.url}`)
        ? sha(readFileSync(`public${m.url}`))
        : "";
      // Bytes a later version replaced: archived beside the record when it
      // asks for that, so the version still opens; otherwise git keeps them.
      const archived = `/media/showcase/${record.project}/v${n}/${path.basename(m.url)}`;
      if (now === digest) media[digest] = { path: m.path, url: m.url };
      else if (record.archive) {
        const file = `public${archived}`;
        const held = existsSync(file) ? sha(readFileSync(file)) : "";
        if (held !== digest) {
          changed.push(file);
          if (!check) {
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, bytes);
          }
        }
        written.push(file);
        media[digest] = { path: m.path, url: archived };
      } else
        media[digest] = {
          path: m.path,
          git: { commit, path: `public${m.url}` },
          shipped: false,
        };
    }
    // A recipe whose bytes a later commit replaced is no longer trusted, so
    // the version is built on today's: new required parameters take the
    // record's `recipeDefaults`, chosen to draw as the old recipe did.
    const modules = {};
    const rebased = new Set();
    for (const [id, m] of Object.entries(registry.modules)) {
      const now = trusted[id];
      modules[id] = now && now.file.sha256 !== m.file.sha256 ? now : m;
      if (modules[id] !== m) rebased.add(id);
    }
    const built = mixProject(template.mix.cut, template.name, files, modules);
    const used = new Set();
    for (const layer of built.layers) {
      if (!rebased.has(layer.moduleId)) continue;
      used.add(layer.moduleId);
      const schema = modules[layer.moduleId].parameterSchema;
      for (const key of schema.required ?? []) {
        if (key in layer.parameters) continue;
        const value = record.recipeDefaults?.[layer.moduleId]?.[key];
        assert.ok(
          value !== undefined,
          `v${n}: ${layer.moduleId} now needs ${key}; add it to recipeDefaults`,
        );
        layer.parameters = { ...layer.parameters, [key]: value };
      }
    }
    const project = {
      ...built,
      id: `${record.project}-v${n}`,
      name: `${record.name} · v${n}`,
    };
    if (used.size) version.rebased = [...used].sort();
    else delete version.rebased;
    const file = `${dir}/project-v${n}.json`;
    await put(file, await json(project, file));
    version.file = `project-v${n}.json`;
    version.projectId = project.id;
    version.layers = project.layers.length;
    version.durationFrames = project.composition.durationFrames;
  }
  // Withheld files keep their reason; the rest is derived.
  for (const [digest, entry] of Object.entries(media))
    if (!entry.url && record.media?.[digest]?.reason)
      entry.reason = record.media[digest].reason;
  record.media = Object.fromEntries(
    Object.entries(media).sort(
      ([a, x], [b, y]) => x.path.localeCompare(y.path) || a.localeCompare(b),
    ),
  );
  await put(recordPath, await json(record, recordPath));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
if (check && changed.length) {
  console.error(`Out of date: ${changed.join(", ")}`);
  process.exit(1);
}
console.log(
  `${check ? "Checked" : "Wrote"} ${written.join(", ")}${changed.length ? ` (changed: ${changed.length})` : ""}`,
);

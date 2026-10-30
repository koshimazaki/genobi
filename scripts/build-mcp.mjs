// Bundle the MCP and CLI entry points into the Genobi plugin, and ship the
// licence text of every third-party package either bundle contains beside them.
import { build } from "esbuild";
import { chmod, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "plugins/genobi/server");
const packages = new Set();
for (const [source, name] of [
  ["mcp/main.ts", "genobi-mcp.mjs"],
  ["cli/main.ts", "genobi-cli.mjs"],
]) {
  const { metafile } = await build({
    entryPoints: [join(root, source)],
    outfile: join(out, name),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: true,
    legalComments: "none",
    metafile: true,
    banner: { js: "// Built by `npm run build:mcp`. Do not edit." },
  });
  if (name === "genobi-cli.mjs") await chmod(join(out, name), 0o755);
  for (const input of Object.keys(metafile.inputs)) {
    const match = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);
    if (match) packages.add(match.at(-1).slice("node_modules/".length));
  }
}
const notices = [];
for (const name of [...packages].sort()) {
  const directory = join(root, "node_modules", name);
  const meta = JSON.parse(await readFile(join(directory, "package.json")));
  const file = (await readdir(directory)).find((f) =>
    /^(licen[cs]e|copying)(\.|$)/i.test(f),
  );
  if (!file) throw new Error(`No licence file for bundled package ${name}`);
  const text = await readFile(join(directory, file), "utf8");
  notices.push(`${name}@${meta.version} (${meta.license})\n\n${text.trim()}`);
}
await writeFile(
  join(out, "THIRD_PARTY_LICENSES.txt"),
  `genobi-mcp.mjs and genobi-cli.mjs bundle these packages:\n\n${notices.join(`\n\n${"-".repeat(72)}\n\n`)}\n`,
);
console.log(`Bundled ${packages.size} packages with their licences.`);

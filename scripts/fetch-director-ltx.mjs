import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const destination = process.argv[2];
if (!destination)
  throw new Error(
    "Usage: node scripts/fetch-director-ltx.mjs <new-output-directory>",
  );
const revision = "44c8a36b7c31ee00b4271daed11dc2a4aa481140";
const source = `https://raw.githubusercontent.com/Lightricks/ComfyUI-LTXVideo/${revision}/`;
const files = [
  [
    "example_workflows/2.5/LTX-2.5_ICLoRA_Inpaint_Two_Stage_Distilled.json",
    "workflow.json",
    "b7a59e1a02dd9a93b79540b162ed326be956901ffbc970e0a168b9ebff3031ae",
  ],
  [
    "LICENSE",
    "UPSTREAM-LICENSE.txt",
    "7c8ef302fa1444a3a5650c2dfa09c6927a52b233202431023abb32519f354397",
  ],
];
const downloads = await Promise.all(
  files.map(async ([path, name, hash]) => {
    const response = await fetch(source + path, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Download failed: ${response.status} ${path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== hash)
      throw new Error(`Hash mismatch: ${name}`);
    return { name, bytes };
  }),
);
const directory = resolve(destination);
await mkdir(directory); // Refuse an existing directory; never overwrite a customized graph.
for (const { name, bytes } of downloads)
  await writeFile(resolve(directory, name), bytes, { flag: "wx" });
await writeFile(
  resolve(directory, "source.json"),
  JSON.stringify(
    {
      repository: "Lightricks/ComfyUI-LTXVideo",
      revision,
      files: files.map(([path, name, sha256]) => ({ path, name, sha256 })),
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  `Verified official workflow and license saved to ${directory}. No model installation or job submission performed.`,
);

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { format } from "prettier";
const root = new URL("../", import.meta.url);
const data = await readFile(
  new URL("shared/licensing/catalog.json", root),
  "utf8",
);
await mkdir(new URL("public/credits/", root), { recursive: true });
await writeFile(
  new URL("public/credits/catalog.json", root),
  await format(data, { parser: "json" }),
);
console.log("Exported taste catalogue.");

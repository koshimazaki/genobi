import { readFileSync } from "node:fs";
import type { Bundle } from "../src/director/bundle";
export function assetFixture(): Bundle {
  const root = new URL("../docs/director-bundle/example/", import.meta.url);
  const project = JSON.parse(
    readFileSync(new URL("studio.json", root), "utf8"),
  );
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const item of [
    ...Object.values(project.assets),
    ...Object.values(project.modules),
  ] as { file: { path: string } }[])
    files.set(
      item.file.path,
      new Uint8Array(readFileSync(new URL(item.file.path, root))),
    );
  return { project, files };
}
export function imageFile() {
  return new File(
    [
      new Uint8Array(
        readFileSync(
          new URL(
            "../docs/director-bundle/templates/poster-motion.png",
            import.meta.url,
          ),
        ),
      ),
    ],
    "my.photo (1).png",
    { type: "image/png" },
  );
}

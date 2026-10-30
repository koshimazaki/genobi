import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRemix } from "../src/director/remix-template";
import { templates } from "../src/director/template-catalogue";
import {
  validateFiles,
  importBundle,
  type Bundle,
} from "../src/director/bundle";
import { runDirectorCommand } from "../src/director/remix-commands";
import { zipSync, strToU8 } from "fflate";

function base(): Bundle {
  const root = new URL("../docs/director-bundle/example/", import.meta.url);
  const project = JSON.parse(
    readFileSync(new URL("studio.json", root), "utf8"),
  );
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const item of [
    ...Object.values(project.assets),
    ...Object.values(project.modules),
  ] as { file: { path: string } }[]) {
    files.set(
      item.file.path,
      new Uint8Array(readFileSync(new URL(item.file.path, root))),
    );
  }
  return { project, files };
}

describe("offline template bundles", () => {
  it.each(templates)(
    "$name survives title edit, ZIP round trip and locked soundtrack",
    async (template) => {
      const images = template.slots.map((slot) => {
        const filename =
          template.id === "character-intro"
            ? "character-intro"
            : template.id === "poster-motion"
              ? "poster-motion"
              : `outfit-${slot.id}`;
        return new Uint8Array(
          readFileSync(
            new URL(
              `../docs/director-bundle/templates/${filename}.png`,
              import.meta.url,
            ),
          ),
        );
      });
      const original = base();
      const bundle = await buildRemix(original, template.id, images);
      expect(original.project.id).toBe("signal-studies");
      expect(bundle.project.layers[0].locked).toBe(true);
      const result = await runDirectorCommand(bundle, {
        op: "text",
        revision: 1,
        layerId: "title",
        text: "A LONGER HEADLINE THAT SHOULD SURVIVE THE ROUND TRIP",
      });
      if (!("bundle" in result) || !result.bundle)
        throw new Error("Missing edited project");
      const next = result.bundle;
      expect(next.project.layers.filter((l) => l.id !== "title")).toEqual(
        bundle.project.layers.filter((l) => l.id !== "title"),
      );
      const data = zipSync({
        ...Object.fromEntries(next.files),
        "project.json": strToU8(JSON.stringify(next.project)),
      });
      const reopened = await importBundle(
        new File([new Uint8Array(data)], "template.zip", {
          type: "application/zip",
        }),
      );
      await validateFiles(reopened);
      expect(reopened.project).toEqual(next.project);
      const media = reopened.project.layers.filter((l) => l.kind === "image");
      expect(media.reduce((n, l) => n + l.durationFrames, 0)).toBe(180);
      for (const slot of template.slots)
        expect(
          media.filter((l) => slot.layerIds.some((id) => id === l.id)).length,
        ).toBe(slot.layerIds.length);
      expect(reopened.project.generations).toEqual([]);
      expect(reopened.project.generationPlans).toEqual([]);
    },
  );
  it("rejects incomplete template assets before assembling a project", async () => {
    await expect(buildRemix(base(), "outfit-reveal", [])).rejects.toThrow(
      "incomplete",
    );
  });
});

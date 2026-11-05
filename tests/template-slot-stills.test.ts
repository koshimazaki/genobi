import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mixTemplates } from "../shared/templates/catalogue";
import { versionSlots } from "../shared/templates/version";

const mixes = mixTemplates.filter((t) => t.mix?.recipes);

describe("the stills that made each template slot", () => {
  it("records them for Bloom, Dance with Fruits and Acoustic Spaces v2", () => {
    expect(mixes.map((t) => t.id).sort()).toEqual([
      "audio-reactive-drop",
      "bloom-teaser",
      "fruits-swap",
    ]);
  });

  it.each(mixes.map((t) => [t.id, t] as const))(
    "%s: every record names a bundled slot and a still that ships under 1 MiB",
    (_id, template) => {
      const slots = new Set(versionSlots(template).map((s) => s.id));
      for (const [id, recipe] of Object.entries(template.mix!.recipes!)) {
        expect(slots.has(id), id).toBe(true);
        for (const url of [recipe.reference, recipe.guide]) {
          if (!url) continue;
          expect(url).toMatch(/^\/media\/[a-z0-9/_-]+\.jpg$/);
          const file = statSync(`public${url}`);
          expect(file.isFile(), url).toBe(true);
          expect(file.size, url).toBeLessThan(1024 * 1024);
        }
        // A prompt is either recorded or named as missing, never both.
        expect(Boolean(recipe.prompt), id).toBe(
          !recipe.missing?.includes("prompt"),
        );
      }
    },
  );
});

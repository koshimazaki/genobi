import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { houseTemplates } from "../shared/templates/catalogue";
import type { HouseTemplate } from "../shared/templates/types";
import { importBundle } from "../src/director/bundle";
import {
  buildTemplateBundle,
  CAPTION_SCRIM,
  projectPlan,
  TYPE_CONTRAST,
} from "../src/director/house-template";
import { contrastRatio } from "../src/director/plate";
import { base, samples } from "./house-template-fixtures";

const [product, character, av] = houseTemplates;

describe("a template's inputs travel with the project", () => {
  const night = {
    mode: "outside",
    preset: "outdoor_night",
    level: "high",
  } as const;
  const value = { bpm: 100, acoustic: night, title: "NIGHT SHIFT" };

  it("keeps the chosen room through a ZIP and reads it back", async () => {
    const bundle = await buildTemplateBundle(base(), av, value, samples(av));
    expect(bundle.project.template).toEqual({
      id: "audio-visual",
      inputs: {
        subject: av.inputs.subject.default,
        title: "NIGHT SHIFT",
        aspect: "16:9",
        bpm: 100,
        acoustic: night,
      },
    });
    const zip = zipSync({
      ...Object.fromEntries(bundle.files),
      "project.json": strToU8(JSON.stringify(bundle.project)),
    });
    const reopened = await importBundle(
      new File([new Uint8Array(zip)], "av.zip"),
    );
    const plan = projectPlan(av, reopened.project);
    expect(plan.inputs.acoustic).toEqual(night);
    expect(plan.inputs.title).toBe("NIGHT SHIFT");
    expect(plan.shots[0].prompt).toMatch(/AKUSPACE .*night/);
    expect(plan.shots[0].prompt).not.toMatch(/cathedral/);
    expect(plan.shots.map((s) => s.prompt)).toEqual(
      reopened.project.generationPlans.map((g) => g.prompt),
    );
  });

  it("follows the project's tempo and frame, and falls back when the record no longer fits", async () => {
    const bundle = await buildTemplateBundle(base(), av, value, samples(av));
    const p = bundle.project;
    expect(
      projectPlan(av, { ...p, composition: { ...p.composition, bpm: 120 } })
        .inputs,
    ).toMatchObject({ bpm: 120, acoustic: night });
    const stale = {
      ...p,
      template: {
        id: "audio-visual",
        inputs: {
          ...p.template!.inputs,
          acoustic: { ...night, preset: "moon" },
        },
      },
    };
    expect(projectPlan(av, stale).inputs.acoustic).toEqual(av.inputs.acoustic);
    const renamed = {
      ...p,
      layers: p.layers.map((l) =>
        l.id === "title" && l.kind === "graphics"
          ? { ...l, parameters: { ...l.parameters, text: "DAWN" } }
          : l,
      ),
    };
    expect(projectPlan(av, renamed).inputs).toMatchObject({
      title: "DAWN",
      acoustic: night,
    });
    const other = { ...p, template: { ...p.template!, id: "product-video" } };
    // A record for another template is ignored; the headline still counts.
    expect(projectPlan(av, other).inputs).toMatchObject({
      acoustic: av.inputs.acoustic,
      bpm: 100,
      title: "NIGHT SHIFT",
    });
  });

  it("keeps the edited tempo, room and frame when only the headline is too long", async () => {
    const bundle = await buildTemplateBundle(base(), av, value, samples(av));
    const p = bundle.project;
    // Valid for the Headline control and the caption (80), over the title cap (40).
    const headline = "A HEADLINE LONGER THAN THE TEMPLATE TITLE CAP OF FORTY";
    expect(headline.length).toBeGreaterThan(40);
    expect(headline.length).toBeLessThanOrEqual(80);
    const edited = {
      ...p,
      composition: { ...p.composition, bpm: 90 },
      layers: p.layers.map((l) =>
        l.id === "title" && l.kind === "graphics"
          ? { ...l, parameters: { ...l.parameters, text: headline } }
          : l,
      ),
    };
    const plan = projectPlan(av, edited);
    expect(plan.inputs).toMatchObject({
      bpm: 90,
      acoustic: night,
      aspect: "16:9",
      title: "NIGHT SHIFT",
    });
    expect(plan.shots.every((s) => s.input.duration === 3)).toBe(true);

    const portrait = await buildTemplateBundle(base(), product, {
      aspect: "9:16",
    });
    const long = {
      ...portrait.project,
      layers: portrait.project.layers.map((l) =>
        l.id === "title" && l.kind === "graphics"
          ? { ...l, parameters: { ...l.parameters, text: headline } }
          : l,
      ),
    };
    expect(projectPlan(product, long).inputs).toMatchObject({
      aspect: "9:16",
      title: product.inputs.title.default,
    });
  });

  it("is refused by the schema when malformed", async () => {
    const bundle = await buildTemplateBundle(base(), product);
    const project = {
      ...bundle.project,
      template: { id: "product-video", inputs: { subject: "x" } },
    };
    const zip = zipSync({
      ...Object.fromEntries(bundle.files),
      "project.json": strToU8(JSON.stringify(project)),
    });
    await expect(
      importBundle(new File([new Uint8Array(zip)], "bad.zip")),
    ).rejects.toThrow("Invalid bundle");
  });
});

describe("type reads on the caption recipe", () => {
  // anime-caption.mjs: a scrim from 57% of the height (clear) to the bottom
  // (rgba(8,12,20,.94)), with the last line's baseline at 87%.
  const recipe = readFileSync(
    new URL(
      "../docs/director-bundle/example/graphics/anime-caption.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const hex = (rgb: number[]) =>
    `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const rgb = (h: string) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a: string, b: string, t: number) =>
    hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
  /** What sits behind the baseline: each plate under the words, under the scrim. */
  function backdrops(template: HouseTemplate, from: string) {
    const { swatches } = template.style;
    const alpha = (0.94 * (0.87 - 0.57)) / (1 - 0.57);
    return template.shots
      .map((shot, i) => ({ shot, i }))
      .filter(({ i }) => i >= template.shots.findIndex((s) => s.id === from))
      .map(({ i }) => {
        const plate = mix(
          swatches[i % swatches.length].hex,
          swatches[(i + 1) % swatches.length].hex,
          0.87,
        );
        return mix(plate, CAPTION_SCRIM, alpha);
      });
  }

  it("matches the recipe this check reads", () => {
    for (const part of ["rgba(8,12,20,.94)", "height * 0.57", "height * 0.87"])
      expect(recipe).toContain(part);
    expect(rgb(CAPTION_SCRIM)).toEqual([8, 12, 20]);
  });

  it.each(houseTemplates)(
    "$id sets its title in a swatch that reads on the scrim",
    (t) => {
      for (const track of t.tracks) {
        if (track.kind !== "type") continue;
        const colour = t.style.swatches[track.swatch].hex;
        expect(contrastRatio(colour, CAPTION_SCRIM)).toBeGreaterThanOrEqual(
          TYPE_CONTRAST,
        );
        for (const backdrop of backdrops(t, track.from))
          expect(
            contrastRatio(colour, backdrop),
            `${t.id} on ${backdrop}`,
          ).toBeGreaterThanOrEqual(TYPE_CONTRAST);
      }
    },
  );

  it("refuses the dark swatches the product and character once used", async () => {
    for (const [template, dark] of [
      [product, 2],
      [character, 3],
    ] as const) {
      const darkType = {
        ...template,
        tracks: template.tracks.map((t) =>
          t.kind === "type" ? { ...t, swatch: dark } : t,
        ),
      };
      await expect(
        buildTemplateBundle(base(), darkType, {}, samples(template)),
      ).rejects.toThrow("unreadable on the caption scrim");
    }
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { strToU8, unzlibSync, zipSync } from "fflate";
import { fitControls } from "../shared/controls";
import { lanes } from "../shared/director/tracks";
import { inspectImage } from "../shared/image";
import { composePrompt } from "../shared/presets";
import { readyEntry, registry } from "../shared/registry";
import {
  findHouseTemplate,
  houseTemplates,
} from "../shared/templates/catalogue";
import {
  checkTemplate,
  planTemplate,
  readInputs,
  templateEntries,
  tierOf,
} from "../shared/templates/plan";
import type { HouseTemplate } from "../shared/templates/types";
import { importBundle, validateFiles } from "../src/director/bundle";
import {
  buildTemplateBundle,
  shotLayerId,
} from "../src/director/house-template";
import { base, samples } from "./house-template-fixtures";
import { platePng } from "../src/director/plate";
import { validateInput } from "../server/validation";
import { readBrief, resolveBrief } from "../src/director/prompt-brief";
import { isH3Router } from "../shared/comfy/h3-router";

/** A 256-pixel PNG as a data URL: the smallest still H3 on Router takes. */
const stillUrl = `data:image/png;base64,${Buffer.from(
  platePng(256, 256, "#000000", "#ffffff"),
).toString("base64")}`;

/** Every input combination a template's spec offers, at its tempo bounds. */
function variants(template: HouseTemplate) {
  const tempos = template.inputs.bpm
    ? [template.inputs.bpm.min, 97, 120, template.inputs.bpm.max]
    : [undefined];
  return template.inputs.aspects.flatMap((aspect) =>
    tempos.map((bpm) => ({ aspect, ...(bpm ? { bpm } : {}) })),
  );
}

describe("house templates against the registry", () => {
  it("are the three of issue #20, the anime teaser, Sheet to shot and Falling room, each with an empty example slot", () => {
    expect(houseTemplates.map((t) => t.id)).toEqual([
      "product-video",
      "character-piece",
      "audio-visual",
      "anime-teaser",
      "sheet-to-shot",
      "falling-room",
    ]);
    for (const t of houseTemplates) {
      expect(t.examples).toEqual([]);
      expect(t.description.length).toBeLessThanOrEqual(80);
      expect(findHouseTemplate(t.id)).toBe(t);
    }
    expect(findHouseTemplate("studio")).toBeUndefined();
  });

  it.each(houseTemplates)("$id names only entries the registry has", (t) => {
    checkTemplate(t);
    for (const id of templateEntries(t))
      expect(registry.find((e) => e.id === id)?.status).toBe("ready");
    // A shot is a video, or a still (Falling room's Klein shot).
    for (const shot of t.shots)
      expect(["video", "image"]).toContain(readyEntry(shot.entry)?.generator);
  });

  it.each(houseTemplates)(
    "$id plans runs that fit each entry's controls in every variant",
    (t) => {
      for (const value of variants(t)) {
        const plan = planTemplate(t, value);
        for (const shot of plan.shots) {
          // Unchanged by fitControls: the duration, ratio and room are offered.
          expect(fitControls(shot.entry.controls, shot.input)).toBe(shot.input);
          expect(shot.input.duration).toBeGreaterThanOrEqual(
            shot.seconds - 1e-9,
          );
          expect(shot.prompt.length).toBeLessThanOrEqual(10000);
        }
      }
    },
  );

  it.each(houseTemplates)(
    "$id plans runs the server accepts unchanged, at the longest subject",
    (t) => {
      for (const value of variants(t)) {
        const plan = planTemplate(t, { ...value, subject: "s".repeat(240) });
        for (const shot of plan.shots) {
          // H3 on Router needs its two references (sheet, storyboard) as
          // data URLs; the agent adds them to the plan's quote.
          const input = isH3Router(shot.input.model)
            ? { ...shot.input, imageReferences: [stillUrl, stillUrl] }
            : shot.input;
          // The server adds empty defaults; what it would send is the same.
          const accepted = validateInput(input);
          const { acoustic, ...rest } = input;
          expect(accepted).toMatchObject(rest);
          expect(accepted.acoustic ?? null).toEqual(acoustic ?? null);
          expect(composePrompt(accepted)).toBe(shot.prompt);
        }
      }
    },
  );

  it("labels each template by how open its models are", () => {
    expect(houseTemplates.map((t) => [t.id, tierOf(t), t.tier])).toEqual([
      ["product-video", "open", "open"],
      ["character-piece", "open", "open"],
      ["audio-visual", "open", "open"],
      // FLUX 3 Edit (closed) draws the sheet and the storyboard: one closed step.
      ["anime-teaser", "semi-open", "semi-open"],
      // MiniMax H3 is listed open, and Sheet to shot makes nothing first.
      ["sheet-to-shot", "open", "open"],
      // FLUX 3 Image Klein has open weights; the take and the room are free.
      ["falling-room", "open", "open"],
    ]);
    const closedShots = {
      ...houseTemplates[0],
      shots: houseTemplates[0].shots.map((s) => ({
        ...s,
        entry: "flux-3-video",
      })),
    };
    expect(tierOf(closedShots)).toBe("premium");
    expect(() => checkTemplate(closedShots)).toThrow("is premium, not open");
  });

  it("refuses an entry, camera term or length the registry cannot run", () => {
    const [product] = houseTemplates;
    const withShot = (patch: object) => ({
      ...product,
      shots: product.shots.map((s, i) => (i ? s : { ...s, ...patch })),
    });
    expect(() => planTemplate(withShot({ entry: "ltx-hdr" }))).toThrow(
      "ready video entry",
    );
    expect(() => planTemplate(withShot({ entry: "nope" }))).toThrow(
      "Unknown registry entry",
    );
    expect(() =>
      planTemplate(
        withShot({
          camera: { "shot-sizes": null, angles: null, movements: "trucking" },
        }),
      ),
    ).toThrow("has no trucking");
    expect(() => planTemplate(withShot({ length: { seconds: 25 } }))).toThrow(
      "No offered length",
    );
  });
});

describe("house template inputs", () => {
  const [product, character, av] = houseTemplates;
  it("repeats the house style: other inputs change only what they name", () => {
    const a = planTemplate(character);
    const subject = "a tall man with a grey beard and a navy work coat";
    const b = planTemplate(character, { subject });
    expect(planTemplate(character)).toEqual(a);
    // A subject that opens a sentence is capitalised there.
    const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
    for (const [i, shot] of b.shots.entries()) {
      expect(lower(shot.prompt)).toContain(subject);
      expect(lower(shot.prompt).replace(subject, a.inputs.subject)).toBe(
        lower(a.shots[i].prompt),
      );
      for (const piece of [
        character.style.look,
        character.style.lighting,
        character.style.palette,
        character.style.negativeSpace,
      ])
        expect(shot.prompt).toContain(piece);
    }
  });
  it("keeps dollar sequences in a subject literal", () => {
    const subject = "a neon sign reading $$ and $& over the door";
    const plan = planTemplate(product, { subject });
    for (const shot of plan.shots) {
      expect(shot.prompt).toContain("$$ and $&");
      expect(shot.prompt).not.toContain("{subject}");
    }
  });

  it("opens 9:16 first for the character and 16:9 for the others", () => {
    expect(planTemplate(character).inputs.aspect).toBe("9:16");
    expect(planTemplate(product).inputs.aspect).toBe("16:9");
    expect(planTemplate(product, { aspect: "9:16" }).inputs.aspect).toBe(
      "9:16",
    );
  });

  it("cuts the audio-visual piece on the bar and adds the room", () => {
    const plan = planTemplate(av, { bpm: 90 });
    const bar = (4 * 60) / 90;
    expect(plan.shots.map((s) => s.start)).toEqual([0, bar, 2 * bar]);
    expect(plan.shots.every((s) => s.input.duration === 3)).toBe(true);
    for (const shot of plan.shots)
      expect(shot.prompt).toMatch(/AKUSPACE .*cathedral/);
  });

  it("validates type, length and format", () => {
    expect(readInputs(product, { title: "  NEW\x00\nNAME " }).title).toBe(
      "NEW NAME",
    );
    const bad: [HouseTemplate, unknown, string][] = [
      [product, null, "must be an object"],
      [product, { colour: "red" }, "Unknown template input"],
      [product, { subject: "" }, "1 to 240"],
      [product, { subject: 7 }, "1 to 240"],
      [product, { title: "X".repeat(41) }, "1 to 40"],
      [product, { aspect: "1:1" }, "takes 16:9 or 9:16"],
      [product, { bpm: 120 }, "does not take a tempo"],
      [product, { acoustic: {} }, "does not take a room"],
      [av, { aspect: "9:16" }, "takes 16:9"],
      [av, { bpm: 300 }, "60 to 180"],
      [av, { bpm: Number.NaN }, "60 to 180"],
      [av, { acoustic: { mode: "room", preset: "moon" } }, "room AKUSPACE"],
    ];
    for (const [template, value, message] of bad)
      expect(() => readInputs(template, value)).toThrow(message);
  });
});

describe("house templates as Director projects", () => {
  it.each(houseTemplates)(
    "$id opens with its shots, tracks, plans and brief",
    async (t) => {
      const plan = planTemplate(t);
      const bundle = await buildTemplateBundle(base(), t, {}, samples(t));
      const p = bundle.project;
      expect(p.id).toBe(t.id);
      expect(p.composition.width < p.composition.height).toBe(
        plan.inputs.aspect === "9:16",
      );
      // An optional track Genobi makes opens no lane until there is one.
      expect(lanes(p.layers).map((l) => l.id)).toEqual(
        t.tracks
          .filter((k) => k.kind !== "audio" || samples(t)[k.reference])
          // A take's roomed sound opens no lane until it is made.
          .filter((k) => k.kind !== "take-sound")
          .map((track) => track.id),
      );
      const shots = p.layers.filter((l) => l.track === "shots");
      expect(shots.map((l) => l.id)).toEqual(
        [...t.shots, ...(t.takes ?? [])].map((s) => shotLayerId(s.id)),
      );
      expect(shots.reduce((n, l) => n + l.durationFrames, 0)).toBe(
        p.composition.durationFrames,
      );
      expect(p.generationPlans.map((g) => g.prompt)).toEqual(
        plan.shots.map((s) => s.prompt),
      );
      const title = p.layers.find((l) => l.id === "title");
      expect(title).toMatchObject({
        parameters: { text: t.inputs.title.default },
      });
      const brief = readBrief(bundle);
      expect(brief.text).toContain(t.style.negativeSpace);
      // Each still supplied is bound as [Image n]; a track is not.
      expect(resolveBrief(bundle).references.length).toBe(
        t.references.filter(
          (r) => r.kind === "image" && samples(t)[r.id]?.length,
        ).length,
      );
      expect(p.generations).toEqual([]);
    },
  );

  it("builds the same bytes from the same inputs, and survives a ZIP", async () => {
    const [, character] = houseTemplates;
    const a = await buildTemplateBundle(
      base(),
      character,
      { aspect: "16:9" },
      samples(character),
    );
    const b = await buildTemplateBundle(
      base(),
      character,
      { aspect: "16:9" },
      samples(character),
    );
    expect(b.project).toEqual(a.project);
    expect([...b.files]).toEqual([...a.files]);
    expect(a.project.composition).toMatchObject({ width: 640, height: 360 });
    expect(a.project.generationPlans[0].referenceAssetIds).toEqual([
      "character-1",
    ]);
    const data = zipSync({
      ...Object.fromEntries(a.files),
      "project.json": strToU8(JSON.stringify(a.project)),
    });
    const reopened = await importBundle(
      new File([new Uint8Array(data)], "template.zip"),
    );
    await validateFiles(reopened);
    expect(reopened.project).toEqual(a.project);
  });

  it("puts the audio-visual cuts on the downbeat and bounds the track", async () => {
    const av = houseTemplates[2];
    const bundle = await buildTemplateBundle(base(), av, {}, samples(av));
    const p = bundle.project;
    expect(p.composition.bpm).toBe(120);
    expect(
      p.layers.filter((l) => l.track === "shots").map((l) => l.startFrame),
    ).toEqual([0, 60, 120]);
    expect(p.layers.find((l) => l.id === "track")).toMatchObject({
      kind: "audio",
      durationFrames: 180,
    });
    const slow = await buildTemplateBundle(
      base(),
      av,
      { bpm: 90 },
      samples(av),
    );
    // Three bars at 90 BPM run past the six-second sample; the lane stops with it.
    expect(slow.project.composition.durationFrames).toBe(240);
    expect(slow.project.layers.find((l) => l.id === "track")).toMatchObject({
      durationFrames: 180,
    });
  });

  it("refuses missing or wrong media for a reference", async () => {
    const [, character, av] = houseTemplates;
    await expect(buildTemplateBundle(base(), character)).rejects.toThrow(
      "Character stills: add 1 to 3",
    );
    const still = samples(character).character;
    await expect(
      buildTemplateBundle(base(), av, {}, { track: still }),
    ).rejects.toThrow("Track takes audio files");
  });

  it("writes plates as real PNGs fading between two swatches", () => {
    const png = platePng(4, 3, "#000000", "#ff8000");
    expect(inspectImage(png)).toMatchObject({ width: 4, height: 3 });
    const idat = png.subarray(8 + 25 + 8, png.length - 12 - 4);
    const raw = unzlibSync(idat);
    expect([...raw.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...raw.subarray(-3)]).toEqual([255, 128, 0]);
    expect(() => platePng(0, 3, "#000000", "#ffffff")).toThrow("1 to 256");
  });

  it("keeps every template file within the 500-line rule", () => {
    for (const file of [
      "shared/templates/types.ts",
      "shared/templates/catalogue.ts",
      "shared/templates/plan.ts",
      "shared/templates/anime-teaser.ts",
      "shared/templates/sheet-to-shot.ts",
      "shared/templates/falling-room.ts",
      "shared/templates/plan-takes.ts",
      "shared/templates/run-kind.ts",
      "shared/templates/mechanical.ts",
      "shared/templates/intake.ts",
      "src/director/house-template.ts",
      "src/director/plate.ts",
      "src/director/TemplatePlan.tsx",
      "src/director/RemixPanel.tsx",
    ])
      expect(
        readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n")
          .length,
        file,
      ).toBeLessThanOrEqual(500);
  });
});

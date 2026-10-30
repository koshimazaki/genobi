// Box 2.2: the anime teaser as a catalogue template, and its asset intake.
// The template's references, shots and prompts against the specification
// (docs/anime-teaser-template.md); a dropped track proved WAV or MP3 by its
// bytes, everywhere a template reads one; and the agent's first turn with
// the single question about what is missing.
import { describe, expect, it } from "vitest";
import { h3RouterBody } from "../shared/comfy/h3-router";
import { setShotCamera } from "../shared/director/template-commands";
import {
  animeTeaser,
  audioVisual,
  characterPiece,
  productVideo,
} from "../shared/templates/catalogue";
import {
  checkPicks,
  intakePrompt,
  missingQuestion,
  readTemplateMedia,
  startingPicks,
} from "../shared/templates/intake";
import {
  checkTemplate,
  planTemplate,
  templateEntries,
  tierOf,
} from "../shared/templates/plan";
import {
  buildTemplateBundle,
  pickReferences,
} from "../src/director/house-template";
import { platePng } from "../src/director/plate";
import { flac, mp3, wav } from "./audio-fixtures";
import { base, samples } from "./house-template-fixtures";

const PANEL =
  "Use the first image as the character sheet and the second as the storyboard. The same character throughout; follow the storyboard panel";
const still = () => platePng(256, 256, "#000000", "#ffffff");
/** About 20 seconds of 128 kbps MP3 with a Xing frame count. */
const song = () => mp3(417 * 766, 766);

describe("the anime-teaser template", () => {
  it("takes a track, a character sheet and a storyboard, each 0 to 1", () => {
    checkTemplate(animeTeaser);
    expect(
      animeTeaser.references.map((r) => [
        r.id,
        r.kind,
        r.min,
        r.max,
        r.madeWith,
      ]),
    ).toEqual([
      ["track", "audio", 0, 1, "minimax-music-3"],
      ["character", "image", 0, 1, "flux-3-edit"],
      ["storyboard", "image", 0, 1, "flux-3-edit"],
    ]);
    expect(animeTeaser.references[0].candidates).toBe(4);
    expect(animeTeaser.references.slice(1).map((r) => r.example)).toEqual([
      "/scrolls/character.png",
      "/scrolls/storyboard.png",
    ]);
    // FLUX 3 Edit is closed and the only closed step: Semi-open.
    expect(tierOf(animeTeaser)).toBe("semi-open");
    expect(templateEntries(animeTeaser)).toEqual([
      "minimax-h3-router",
      "minimax-music-3",
      "flux-3-edit",
    ]);
  });

  it("plans two 10-second H3 shots at 768P, 16:9 first, with the prompt pattern", () => {
    const plan = planTemplate(animeTeaser);
    expect(plan.inputs.aspect).toBe("16:9");
    expect(plan.seconds).toBe(20);
    for (const [i, shot] of plan.shots.entries()) {
      expect(shot.entry.id).toBe("minimax-h3-router");
      expect(shot.input).toMatchObject({
        generator: "video",
        model: "minimax-h3-router",
        duration: 10,
        resolution: "hd",
        aspectRatio: "16:9",
        // H3 takes the camera panel; the teaser picks no term, so the
        // words carry its camera.
        cameraEnabled: true,
      });
      expect(shot.prompt.startsWith(`${PANEL} ${i + 1};`)).toBe(true);
      expect(shot.prompt).toContain(
        "one smooth continuous shot with no cuts or transitions",
      );
      expect(shot.prompt).toContain(plan.inputs.subject);
      expect(shot.references).toEqual(["character", "storyboard"]);
    }
    expect(planTemplate(animeTeaser, { aspect: "9:16" }).inputs.aspect).toBe(
      "9:16",
    );
    // The Router body: the text, then the sheet and the storyboard in order.
    const [first] = plan.shots;
    const body = h3RouterBody(
      {
        ...first.input,
        imageReferences: [
          "data:image/png;base64,AAAA",
          "data:image/png;base64,BBBB",
        ],
      },
      first.prompt,
    );
    expect(body).toMatchObject({
      duration: 10,
      resolution: "768P",
      ratio: "16:9",
    });
    expect(body.content.map((c) => c.type)).toEqual([
      "text",
      "image_url",
      "image_url",
    ]);
  });

  it("takes H3's camera terms on an H3 shot, and refuses one H3 does not name", async () => {
    const withCamera = (movements: "dolly-in" | "orbit") => ({
      ...animeTeaser,
      shots: animeTeaser.shots.map((s) => ({
        ...s,
        camera: { ...s.camera, "shot-sizes": "close-up" as const, movements },
      })),
    });
    // H3's order: the composition, the panel pattern, then the move.
    const [open] = planTemplate(withCamera("dolly-in")).shots;
    expect(
      open.prompt.startsWith(
        "A close-up frames the upper part of the subject. ",
      ),
    ).toBe(true);
    expect(open.prompt).toContain(` ${PANEL} 1;`);
    expect(
      open.prompt.endsWith(" The camera pushes in toward the subject."),
    ).toBe(true);
    // Orbit has no H3 sentence: no full circle is documented.
    expect(() => planTemplate(withCamera("orbit"))).toThrow("has no orbit");
    const { project } = await buildTemplateBundle(
      base(),
      animeTeaser,
      {},
      samples(animeTeaser),
    );
    const moved = setShotCamera(project, "open", {
      "shot-sizes": null,
      angles: null,
      movements: "pan-left",
    });
    expect(
      moved.generationPlans.find((g) => g.id === "plan-open")?.prompt,
    ).toMatch(/ The camera pans left across the subject\.$/);
    expect(() =>
      setShotCamera(project, "open", {
        "shot-sizes": null,
        angles: null,
        movements: "orbit",
      }),
    ).toThrow("has no orbit move");
  });

  it("opens with the track, the shots and the title, the sheet and storyboard on each plan", async () => {
    const pulse = samples(audioVisual).track;
    const { project } = await buildTemplateBundle(
      base(),
      animeTeaser,
      {},
      {
        ...samples(animeTeaser),
        track: pulse,
      },
    );
    expect(project.composition).toMatchObject({
      width: 640,
      height: 360,
      durationFrames: 600,
    });
    expect(project.generationPlans.map((g) => g.referenceAssetIds)).toEqual([
      ["character-1", "storyboard-1"],
      ["character-1", "storyboard-1"],
    ]);
    expect(project.layers.find((l) => l.id === "track")).toMatchObject({
      kind: "audio",
      assetId: "track-1",
    });
  });

  it("opens with nothing supplied: no track lane until one is added", async () => {
    const { project } = await buildTemplateBundle(base(), animeTeaser, {}, {});
    expect(project.layers.some((l) => l.kind === "audio")).toBe(false);
    expect(
      project.generationPlans.every((g) => !g.referenceAssetIds?.length),
    ).toBe(true);
  });
});

describe("template asset intake", () => {
  const [track, sheet] = animeTeaser.references;

  it("proves a track WAV or MP3 by its bytes and measures it", async () => {
    expect(await readTemplateMedia(track, song())).toMatchObject({
      ext: "mp3",
    });
    const length = (await readTemplateMedia(track, song())).durationSeconds!;
    expect(length).toBeCloseTo((766 * 1152) / 44100, 1);
    expect(await readTemplateMedia(track, wav(2))).toEqual({
      ext: "wav",
      durationSeconds: 2,
    });
    await expect(readTemplateMedia(track, flac(44100))).rejects.toThrow(
      "Track: use a WAV or MP3 file.",
    );
    await expect(readTemplateMedia(track, still())).rejects.toThrow(
      "Track: use a WAV or MP3",
    );
    expect(await readTemplateMedia(sheet, still())).toEqual({ ext: "png" });
    await expect(readTemplateMedia(sheet, wav(1))).rejects.toThrow(
      "Character sheet: use a PNG, JPEG or WebP image.",
    );
  });

  it("puts an MP3 track in the project as a production asset", async () => {
    const references = {
      ...samples(animeTeaser),
      track: [
        {
          bytes: song(),
          ext: "mp3" as const,
          origin: "uploaded" as const,
          durationSeconds: 20,
        },
      ],
    };
    const bundle = await buildTemplateBundle(
      base(),
      animeTeaser,
      {},
      references,
    );
    expect(bundle.project.assets["track-1"]).toMatchObject({
      kind: "audio",
      use: "production",
      origin: "uploaded",
      durationSeconds: 20,
      file: { path: "media/track-1.mp3" },
    });
    expect(bundle.project.layers.find((l) => l.id === "track")).toMatchObject({
      durationFrames: 600,
    });
    // A file of the wrong kind is still refused for a reference.
    await expect(
      buildTemplateBundle(
        base(),
        animeTeaser,
        {},
        {
          track: [{ bytes: still(), ext: "png", origin: "uploaded" }],
        },
      ),
    ).rejects.toThrow("Track takes audio files");
  });

  it("starts the sheet and storyboard at their Scrolls examples, and the track missing", () => {
    // The studio's 6-second pulse is no example for a 20-second teaser: a
    // track Genobi can make starts missing, so the intake asks about it.
    expect(startingPicks(animeTeaser)).toEqual({
      track: "missing",
      character: "example",
      storyboard: "example",
    });
    expect(samples(animeTeaser).track).toBeUndefined();
    // A track nothing makes keeps the pulse.
    expect(startingPicks(audioVisual)).toEqual({ track: "example" });
  });

  it("builds the references from the picks: yours, the example, or nothing", () => {
    const sampled = samples(animeTeaser);
    const mine = {
      storyboard: [
        { bytes: still(), ext: "png" as const, origin: "uploaded" as const },
      ],
    };
    const out = pickReferences(
      animeTeaser,
      { track: "missing", character: "example", storyboard: "yours" },
      sampled,
      mine,
    );
    expect(Object.keys(out)).toEqual(["character", "storyboard"]);
    expect(out.character).toBe(sampled.character);
    expect(out.storyboard).toBe(mine.storyboard);
    expect(() =>
      pickReferences(animeTeaser, { storyboard: "yours" }, sampled, {}),
    ).toThrow("Storyboard: drop a file, or keep the example");
  });

  it("asks one question for a missing track, and one for several", () => {
    const one = {
      track: "missing",
      character: "yours",
      storyboard: "example",
    } as const;
    expect(missingQuestion(animeTeaser, one)).toBe(
      "Do you have a track, or shall I generate one?",
    );
    const prompt = intakePrompt(animeTeaser, one);
    expect(prompt).toContain('genobi_skill with name "anime-teaser"');
    expect(prompt).toContain("Mine: Character sheet.");
    expect(prompt).toContain("The template's examples: Storyboard.");
    expect(prompt).toContain("Missing: Track.");
    // Exactly one question, asked once.
    expect(prompt.match(/\?/g)).toHaveLength(1);
    expect(prompt).toContain(
      'ask me once, in one question: "Do you have a track, or shall I generate one?"',
    );
    const two = intakePrompt(animeTeaser, {
      track: "missing",
      character: "example",
      storyboard: "missing",
    });
    expect(two.match(/\?/g)).toHaveLength(1);
    expect(two).toContain(
      '"Do you have a track and a storyboard, or shall I generate them?"',
    );
    // Nothing missing: no question at all.
    const none = intakePrompt(animeTeaser, {
      track: "yours",
      character: "yours",
      storyboard: "yours",
    });
    expect(none).not.toContain("?");
    expect(none).toContain("Quote every paid step first");
  });

  it("refuses picks the template cannot take", () => {
    expect(() => checkPicks(animeTeaser, { voice: "yours" })).toThrow(
      "Anime teaser has no reference voice",
    );
    // The character piece needs its still: it can be replaced, not left out.
    expect(() => checkPicks(characterPiece, { character: "missing" })).toThrow(
      "Character stills is required",
    );
    // Product photos have no example and nothing makes them: no question.
    expect(startingPicks(productVideo)).toEqual({ product: "missing" });
    expect(missingQuestion(productVideo, { product: "missing" })).toBe(
      undefined,
    );
  });
});

import { expect, it } from "vitest";
import {
  characterPiece,
  dimensionsMix,
  productVideo,
} from "../shared/templates/catalogue";
import { cleanInstruction } from "../shared/director/regenerate";
import { SUBJECT_LIMIT, TITLE_LIMIT } from "../shared/templates/plan";
import { versionSlots } from "../shared/templates/version";
import {
  applyVersionInputs,
  versionPicks,
  versionTextInputs,
} from "../src/director/version-inputs";
import {
  readBrief,
  resolveBrief,
  writeBrief,
} from "../src/director/prompt-brief";
import { versionInstruction } from "../src/director/version-instruction";
import { buildTemplateBundle } from "../src/director/house-template";
import {
  versionBase,
  versionCharacter,
  versionMix,
} from "./director-version-fixtures";

it("keeps reference tokens and bindings valid when a character slot shrinks from three files to one", async () => {
  const base = await versionCharacter();
  const asset = base.project.assets["character-1"];
  base.project.assets["character-2"] = structuredClone(asset);
  base.project.assets["character-3"] = structuredClone(asset);
  const before = writeBrief(base, {
    version: 1,
    text: "Character: [Image 1] [Image 2] [Image 3]\nStyle: retain the red coat [Inspiration 1]",
    references: [
      ...[1, 2, 3].map((n) => ({
        id: `brief-character-${n}`,
        label: `Image ${n}`,
        assetId: `character-${n}`,
      })),
      { id: "custom-style", label: "Inspiration 1", assetId: "character-3" },
    ],
  });
  const next = await applyVersionInputs(
    before,
    characterPiece,
    { character: ["character-2"] },
    versionTextInputs(before, characterPiece),
  );
  const brief = resolveBrief(next);
  expect(brief.references.map((r) => [r.label, r.assetId])).toEqual([
    ["Inspiration 1", "character-3"],
    ["Image 1", "character-2"],
  ]);
  expect(brief.prompt).not.toContain("[Image 2]");
  expect(brief.prompt).not.toContain("[Image 3]");
  expect(brief.prompt).toContain("retain the red coat [Inspiration 1]");
  expect(
    next.project.generationPlans.every(
      (g) => g.referenceAssetIds.join() === "character-2",
    ),
  ).toBe(true);
  const instruction = versionInstruction(next, characterPiece, []);
  expect(cleanInstruction(instruction)).toBe(instruction);
  expect(readBrief(before).references).toHaveLength(4);
});

it("clears an optional product slot without leaving an unbound brief token", async () => {
  const before = await buildTemplateBundle(versionBase(), productVideo);
  const character = await versionCharacter();
  before.project.assets.photo = character.project.assets["character-1"];
  before.files.set(
    before.project.assets.photo.file.path,
    character.files.get(before.project.assets.photo.file.path)!,
  );
  const withPhoto = await applyVersionInputs(
    before,
    productVideo,
    { product: ["photo"] },
    versionTextInputs(before, productVideo),
  );
  const cleared = await applyVersionInputs(
    withPhoto,
    productVideo,
    { product: [] },
    versionTextInputs(withPhoto, productVideo),
  );
  expect(resolveBrief(cleared).references).toEqual([]);
  expect(versionPicks(cleared, productVideo).product).toEqual([]);
  expect(() => versionInstruction(cleared, productVideo, [])).not.toThrow();
});

it("hands the current Words to the agent and updates generated brief lines across repeated edits", async () => {
  let bundle = await versionMix();
  for (const [subject, title] of [
    ["a robot with a blue cloak", "MY ROBOT"],
    ["a dancer in silver", "SILVER"],
  ]) {
    bundle = await applyVersionInputs(
      bundle,
      dimensionsMix,
      versionPicks(bundle, dimensionsMix),
      { ...versionTextInputs(bundle, dimensionsMix), subject, title },
    );
    const brief = resolveBrief(bundle);
    const message = versionInstruction(bundle, dimensionsMix, []);
    expect(bundle.project.template?.inputs).toMatchObject({ subject, title });
    expect(brief.prompt).toContain(
      `${dimensionsMix.inputs.subject.label}: ${subject}`,
    );
    expect(brief.prompt).toContain(
      `${dimensionsMix.inputs.title.label}: ${title}`,
    );
    expect(message).toContain(JSON.stringify({ subject, title }));
    expect(message).not.toContain(dimensionsMix.inputs.subject.default);
    expect(cleanInstruction(message)).toBe(message);
  }
});

it("preserves a custom description while handing off changed Words separately", async () => {
  const original = await versionCharacter();
  const description =
    "Style: quiet watercolor; preserve the red coat [Image 1]";
  const before = writeBrief(original, {
    ...readBrief(original),
    text: description,
  });
  const next = await applyVersionInputs(
    before,
    characterPiece,
    versionPicks(before, characterPiece),
    {
      ...versionTextInputs(before, characterPiece),
      subject: "A painter",
      title: "MAYA",
    },
  );
  expect(readBrief(next).text).toBe(description);
  expect(versionInstruction(next, characterPiece, [])).toContain(
    '"subject":"A painter","title":"MAYA"',
  );
  expect(next.project.layers.find((l) => l.id === "title")).toMatchObject({
    parameters: { text: "MAYA" },
  });
});

it.each(["x", '"'])(
  "fits maximum-length Words (%s) and all choices in the handoff",
  async (letter) => {
    const base = await versionMix();
    const subject = letter.repeat(SUBJECT_LIMIT);
    const title = letter.repeat(TITLE_LIMIT);
    const next = await applyVersionInputs(
      base,
      dimensionsMix,
      versionPicks(base, dimensionsMix),
      { ...versionTextInputs(base, dimensionsMix), subject, title },
    );
    const instruction = versionInstruction(
      next,
      dimensionsMix,
      versionSlots(dimensionsMix).map((slot) => slot.id),
    );
    expect(instruction).toContain(JSON.stringify({ subject, title }));
    expect(cleanInstruction(instruction)).toBe(instruction);
  },
);

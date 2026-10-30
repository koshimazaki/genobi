import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { templatePlan } from "../mcp/template-tools";
import { validateInput } from "../server/validation";
import { lanes } from "../shared/director/tracks";
import { composePrompt } from "../shared/presets";
import { findHouseTemplate } from "../shared/templates/catalogue";
import { fallingRoom } from "../shared/templates/falling-room";
import { intakePrompt, startingPicks } from "../shared/templates/intake";
import { checkTemplate, planTemplate } from "../shared/templates/plan";
import { buildTemplateBundle } from "../src/director/house-template";
import { namedTakeRecipe } from "../src/world-builder/named-takes";
import { base, samples } from "./house-template-fixtures";

// Falling room: one Klein still, then a free World Builder take, then the
// take's sound in the room. Nothing runs when it opens.
const frame = `data:image/png;base64,${readFileSync(
  new URL(
    "../docs/director-bundle/templates/character-intro.png",
    import.meta.url,
  ),
).toString("base64")}`;

describe("the Falling room template", () => {
  it("plans one Klein still and a free take after it", () => {
    expect(findHouseTemplate("falling-room")).toBe(fallingRoom);
    const plan = planTemplate(fallingRoom);
    expect(plan.shots).toHaveLength(1);
    const [still] = plan.shots;
    expect(still.entry.id).toBe("flux-3-klein-api");
    expect(still.input).toMatchObject({
      generator: "image",
      model: "flux-3-klein-api",
      imageResolution: "1k",
      imageAspectRatio: "16:9",
      imageReferences: [],
      cameraEnabled: false,
    });
    expect(still.prompt).toBe(composePrompt(still.input));
    expect(still.prompt).toContain(fallingRoom.inputs.subject.default.slice(1));
    expect(still.prompt).toContain(fallingRoom.style.negativeSpace);
    expect(plan.takes).toEqual([
      {
        id: "fall",
        label: "Fall",
        take: "falling-room",
        frames: 145,
        start: 2,
        seconds: 145 / 24,
      },
    ]);
    // The take is the World Builder's Falling room, to the frame.
    expect(namedTakeRecipe("falling-room").frames).toBe(145);
    expect(plan.seconds).toBeCloseTo(2 + 145 / 24, 9);
  });

  it("quotes the still the server accepts, with the first frame as a reference", () => {
    const [still] = planTemplate(fallingRoom, {
      subject: "s".repeat(240),
    }).shots;
    const accepted = validateInput({
      ...still.input,
      imageReferences: [frame],
    });
    expect(accepted).toMatchObject({
      ...still.input,
      imageReferences: [frame],
    });
    expect(composePrompt(accepted)).toBe(still.prompt);
    const plan = templatePlan("falling-room");
    expect(plan.estimateUsd).toBe(0.009);
    expect(plan.shots.map((s) => s.shotId)).toEqual(["still"]);
    expect(plan.takes).toEqual([
      expect.objectContaining({
        takeId: "fall",
        take: "falling-room",
        free: true,
      }),
    ]);
    expect(plan.next).toContain("genobi_world_recipe");
  });

  it("opens with plates for the still and the take, no room lane, no run", async () => {
    const bundle = await buildTemplateBundle(
      base(),
      fallingRoom,
      {},
      samples(fallingRoom),
    );
    const p = bundle.project;
    expect(lanes(p.layers).map((l) => l.id)).toEqual(["shots", "title"]);
    const shots = p.layers.filter((l) => l.track === "shots");
    expect(shots.map((l) => [l.id, l.startFrame, l.durationFrames])).toEqual([
      ["shot-still", 0, 60],
      ["shot-fall", 60, 181],
    ]);
    expect(p.composition.durationFrames).toBe(241);
    expect(p.generationPlans.map((g) => [g.id, g.status])).toEqual([
      ["plan-still", "not-run"],
    ]);
    expect(p.generations).toEqual([]);
    // The sheet is optional and Genobi can make it, so it opens missing.
    expect(samples(fallingRoom).character).toBeUndefined();
    expect(intakePrompt(fallingRoom, startingPicks(fallingRoom))).toContain(
      "Do you have a character sheet, or shall I generate one?",
    );
  });

  it("refuses a take, a frame count or a reference it cannot keep", () => {
    const withTake = (patch: object) => ({
      ...fallingRoom,
      takes: [{ ...fallingRoom.takes![0], ...patch }],
    });
    expect(() => checkTemplate(withTake({ take: "nope" }))).toThrow(
      "unknown take nope",
    );
    expect(() => checkTemplate(withTake({ frames: 100 }))).toThrow("8k + 1");
    expect(() => checkTemplate(withTake({ id: "still" }))).toThrow(
      "repeated take id",
    );
    expect(() =>
      checkTemplate({
        ...fallingRoom,
        shots: [{ ...fallingRoom.shots[0], firstFrameOf: "other" }],
      }),
    ).toThrow("unknown take other");
    expect(() =>
      planTemplate({
        ...fallingRoom,
        shots: [
          {
            ...fallingRoom.shots[0],
            camera: { "shot-sizes": "wide", angles: null, movements: null },
          },
        ],
      }),
    ).toThrow("framing in words");
  });
});

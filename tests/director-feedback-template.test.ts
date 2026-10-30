import { describe, expect, it } from "vitest";
import { applyCommand, type DirectorCopy } from "../shared/director/commands";
import { placeAsset } from "../shared/director/assets";
import { houseTemplates } from "../shared/templates/catalogue";
import { buildTemplateBundle } from "../src/director/house-template";
import { ops, person, roundTrip } from "./director-feedback-fixture";
import { base, samples } from "./house-template-fixtures";

// Feedback on a template project and on a plate: new template words, a
// shot's camera and a replaced picture come back as the commands that make
// them, and replay to the person's project.
const [product] = houseTemplates;

describe("feedback on templates and plates", () => {
  it("returns new template words and a shot camera", async () => {
    const project = (
      await buildTemplateBundle(base(), product, {}, samples(product))
    ).project;
    const from: DirectorCopy = { project, prompt: "" };
    let current = from;
    for (const command of [
      {
        op: "set-template-inputs",
        inputs: { subject: "a brass desk lamp" },
      },
      {
        op: "set-camera",
        shotId: "hero",
        camera: { "shot-sizes": "wide", angles: null, movements: "orbit" },
      },
    ]) {
      const result = applyCommand(current, command);
      if (!result.ok) throw new Error(result.error);
      current = result.copy;
    }
    const diff = roundTrip(current, from);
    expect(ops(diff.commands)).toEqual(["set-template-inputs", "set-camera"]);
    expect(diff.commands.map((c) => c.label)).toEqual([
      expect.stringContaining('subject "'),
      "shot hero camera: wide, orbit",
    ]);
  });

  it("returns a replaced picture as replace-plate", () => {
    const diff = roundTrip(
      person((p) => placeAsset(p, "image-2", ["photo-1"], "image-2-plate")),
    );
    expect(diff.commands).toEqual([
      {
        command: {
          op: "replace-plate",
          layerId: "photo-1",
          assetId: "image-2",
        },
        label: "Orbit 1 now shows asset image-2",
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cameraLabel, type CameraSelection } from "../shared/camera";
import { applyCommand, type DirectorCopy } from "../shared/director/commands";
import type { Project } from "../shared/director/types";
import { houseTemplates } from "../shared/templates/catalogue";
import {
  buildTemplateBundle,
  projectPlan,
} from "../src/director/house-template";
import TemplatePlan from "../src/director/TemplatePlan";
import { base, samples } from "./house-template-fixtures";

// The two template commands against what the studio shows: a headline typed
// into the title layer survives new inputs that do not name the title, and a
// camera a command sets is the one the shot summary and the plan read.
const [product, , av] = houseTemplates;
const build = async (template = product, value = {}) =>
  (await buildTemplateBundle(base(), template, value, samples(template)))
    .project;
function apply(project: Project, command: unknown) {
  const result = applyCommand({ project, prompt: "" } as DirectorCopy, command);
  if (!result.ok) throw new Error(result.error);
  return result.copy.project;
}
/** The headline field writes the title layer's words directly. */
const typed = (project: Project, text: string): Project => ({
  ...project,
  layers: project.layers.map((l) =>
    l.id === "title" && l.kind === "graphics"
      ? { ...l, parameters: { ...l.parameters, text } }
      : l,
  ),
});
const titleText = (project: Project) => {
  const layer = project.layers.find((l) => l.id === "title")!;
  return "parameters" in layer ? layer.parameters.text : undefined;
};

describe("set-template-inputs keeps a typed headline", () => {
  it("leaves the title layer alone when only the subject changes", async () => {
    const project = typed(await build(), "HAND EDIT");
    const next = apply(project, {
      op: "set-template-inputs",
      inputs: { subject: "a brass desk lamp" },
    });
    expect(titleText(next)).toBe("HAND EDIT");
    expect(next.template?.inputs).toMatchObject({
      subject: "a brass desk lamp",
      title: "HAND EDIT",
    });
  });

  it("leaves it alone when only the room changes", async () => {
    const project = typed(await build(av), "NIGHT DRIVE");
    const room = { mode: "outside", preset: "outdoor_night", level: "high" };
    const next = apply(project, {
      op: "set-template-inputs",
      inputs: { acoustic: room },
    });
    expect(titleText(next)).toBe("NIGHT DRIVE");
    expect(next.template?.inputs.acoustic).toEqual(room);
  });

  it("changes it when the command names the title", async () => {
    const project = typed(await build(), "HAND EDIT");
    const next = apply(project, {
      op: "set-template-inputs",
      inputs: { title: "LUMEN" },
    });
    expect(titleText(next)).toBe("LUMEN");
  });
});

describe("a shot's camera override is what the studio reads", () => {
  const orbit: CameraSelection = {
    "shot-sizes": "wide",
    angles: null,
    movements: "orbit",
  };

  it("reaches projectPlan, with the template's camera for other shots", async () => {
    const next = apply(await build(), {
      op: "set-camera",
      shotId: "hero",
      camera: orbit,
    });
    const plan = projectPlan(product, next);
    const hero = plan.shots.find((s) => s.id === "hero")!;
    expect(hero.input.camera).toEqual(orbit);
    expect(hero.prompt).toBe(
      next.generationPlans.find((g) => g.id === "plan-hero")!.prompt,
    );
    const detail = plan.shots.find((s) => s.id === "detail")!;
    expect(detail.input.camera).toEqual(
      product.shots.find((s) => s.id === "detail")!.camera,
    );
  });

  it("shows in the shot summary", async () => {
    const project = await build();
    const next = apply(project, {
      op: "set-camera",
      shotId: "hero",
      camera: orbit,
    });
    const hero = projectPlan(product, next).shots[0];
    const label = cameraLabel(orbit, hero.entry.videoModel);
    const before = cameraLabel(product.shots[0].camera, hero.entry.videoModel);
    expect(label).not.toBe(before);
    const html = (p: Project) =>
      renderToStaticMarkup(<TemplatePlan project={p} />);
    expect(html(project)).not.toContain(label);
    expect(html(next)).toContain(label);
  });
});

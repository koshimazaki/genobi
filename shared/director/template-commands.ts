// The two Director commands that read a house template: a shot's camera and
// the template's text inputs. Both rewrite the not-run plan prompts with the
// planner the template gallery uses (`shared/templates/plan.ts`), so a prompt
// changed by an agent reads exactly as one the studio would write.
import { cameraSections, termsFor, type CameraSelection } from "../camera";
import { composePrompt } from "../presets";
import { findHouseTemplate } from "../templates/catalogue";
import { planTemplate, readInputs, type TemplatePlan } from "../templates/plan";
import type { TemplateInputs } from "../templates/types";
import type { Layer, Project } from "./types";

const planId = (shotId: string) => `plan-${shotId}`;

function templateOf(project: Project) {
  const template = project.template && findHouseTemplate(project.template.id);
  if (!project.template || !template)
    throw new Error("This project was not built from a house template");
  return { template, inputs: project.template.inputs };
}

/** Set one shot's camera and rewrite its plan prompt in the entry's wording. */
export function setShotCamera(
  project: Project,
  shotId: string,
  camera: CameraSelection,
): Project {
  const { template, inputs } = templateOf(project);
  const shot = planTemplate(template, inputs).shots.find(
    (s) => s.id === shotId,
  );
  const plan = project.generationPlans.find((g) => g.id === planId(shotId));
  if (!shot || !plan)
    throw new Error(
      `No shot ${shotId}; this template has ${template.shots.map((s) => s.id).join(", ")}`,
    );
  if (!shot.input.cameraEnabled)
    throw new Error(
      `${shot.entry.label} takes no camera; its prompt carries the camera in words`,
    );
  // Only the terms the shot's model documents (LTX, FLUX or H3 wording).
  for (const section of cameraSections) {
    const id = camera[section.id];
    if (id && !termsFor(section, shot.input.model).some((t) => t.id === id))
      throw new Error(`${shot.entry.label} has no ${id} move`);
  }
  const prompt = composePrompt({ ...shot.input, camera });
  return {
    ...project,
    generationPlans: project.generationPlans.map((g) =>
      g === plan ? { ...g, camera: { ...camera }, prompt } : g,
    ),
  };
}

/**
 * The plan with each shot's camera as the project holds it: a camera a
 * command set on the shot's generation plan, else the template's own. The
 * shot summary, `projectPlan` and new template inputs all read this.
 */
export function withShotCameras(
  plan: TemplatePlan,
  project: Project,
): TemplatePlan {
  return {
    ...plan,
    shots: plan.shots.map((shot) => {
      const camera = project.generationPlans.find(
        (g) => g.id === planId(shot.id),
      )?.camera;
      if (!camera) return shot;
      const input = { ...shot.input, camera };
      return { ...shot, input, prompt: composePrompt(input) };
    }),
  };
}

/** The type layer's words, which the headline field edits directly. */
function headline(project: Project, typeId: string | undefined) {
  const layer = project.layers.find((l) => l.id === typeId);
  return layer?.kind === "graphics" && typeof layer.parameters.text === "string"
    ? layer.parameters.text
    : undefined;
}

/**
 * New subject, title or room: the template record and every plan prompt
 * follow, each shot keeping a camera a command set. The title layer changes
 * only when the command names the title; otherwise its current words (which
 * the headline field may have edited) stay and become the recorded title.
 * The frame and the tempo rebuild the project, so they stay in the studio.
 */
export function setTemplateInputs(
  project: Project,
  patch: { subject?: string; title?: string; acoustic?: unknown },
): Project {
  const { template, inputs: saved } = templateOf(project);
  const type = template.tracks.find((t) => t.kind === "type");
  const words = headline(project, type?.id);
  let current: TemplateInputs = saved;
  if (words !== undefined && patch.title === undefined)
    try {
      current = readInputs(template, { ...saved, title: words });
    } catch {
      // Words the template cannot record as a title stay on the layer only.
    }
  const inputs = readInputs(template, { ...current, ...patch });
  const plan = withShotCameras(planTemplate(template, inputs), project);
  const layers = project.layers.map((l): Layer => {
    if (patch.title === undefined || !type || l.id !== type.id) return l;
    if (l.kind !== "graphics" || l.parameters.text === inputs.title) return l;
    if (l.locked) throw new Error(`Unlock ${l.name} first`);
    return { ...l, parameters: { ...l.parameters, text: inputs.title } };
  });
  const generationPlans = project.generationPlans.map((g) => {
    const shot = plan.shots.find((s) => planId(s.id) === g.id);
    return shot ? { ...g, prompt: shot.prompt } : g;
  });
  return {
    ...project,
    layers,
    generationPlans,
    template: { id: template.id, inputs },
  };
}

import { acousticLabel } from "../../shared/acoustic";
import { cameraLabel } from "../../shared/camera";
import { laneLabels, lanes } from "../../shared/director/tracks";
import type { Project } from "../../shared/director/types";
import { entryLabel } from "../../shared/registry";
import { findHouseTemplate } from "../../shared/templates/catalogue";
import { TIER_LABEL } from "../../shared/templates/plan";
import { projectPlan, shotLayerId } from "./house-template";
import "./template-plan.css";

const seconds = (n: number) => `${Number(n.toFixed(2))} s`;

/**
 * A house template's shots and tracks in the simple Director. Timing,
 * prompts and lanes are read from the project, so edits show here; each
 * shot's model comes from the template, and its camera from the project's
 * plan when a command set one, else from the template.
 */
export default function TemplatePlan({ project }: { project: Project }) {
  const template = findHouseTemplate(project.id);
  if (!template) return null;
  const plan = projectPlan(template, project);
  const all = lanes(project.layers),
    labels = laneLabels(all);
  const { inputs } = template;
  return (
    <div className="dir-template-plan" aria-label={`${template.name} plan`}>
      <p className="dir-eyebrow">
        {TIER_LABEL[template.tier]} · {template.style.name} house style
      </p>
      <p>{template.description}</p>
      <h3>Shots</h3>
      <ol className="dir-plan-shots">
        {plan.shots.map((shot) => {
          const layer = project.layers.find(
            (l) => l.id === shotLayerId(shot.id),
          );
          const prompt = project.generationPlans.find(
            (g) => g.id === `plan-${shot.id}`,
          )?.prompt;
          return (
            <li key={shot.id} data-shot={shot.id}>
              <strong>{shot.label}</strong>
              <span>
                {layer
                  ? seconds(layer.durationFrames / project.composition.fps)
                  : "removed"}{" "}
                · {entryLabel(shot.entry)} ·{" "}
                {shot.input.generator === "image"
                  ? "still"
                  : `${shot.input.duration} s clip`}
              </span>
              <span>
                {cameraLabel(
                  shot.input.camera ??
                    template.shots.find((s) => s.id === shot.id)!.camera,
                  shot.entry.videoModel,
                )}
              </span>
              {prompt && (
                <details>
                  <summary>Prompt</summary>
                  <p>{prompt}</p>
                </details>
              )}
            </li>
          );
        })}
        {plan.takes.map((take) => {
          const layer = project.layers.find(
            (l) => l.id === shotLayerId(take.id),
          );
          return (
            <li key={take.id} data-take={take.id}>
              <strong>{take.label}</strong>
              <span>
                {layer
                  ? seconds(layer.durationFrames / project.composition.fps)
                  : "removed"}{" "}
                · World Builder take · free, captured in the 3D view
              </span>
            </li>
          );
        })}
      </ol>
      <h3>Tracks</h3>
      <ul className="dir-plan-tracks">
        {[...all].reverse().map((lane) => (
          <li key={lane.id} data-track={lane.id}>
            <strong>{labels.get(lane.id)}</strong>
            {template.tracks.find((t) => t.id === lane.id)?.name ??
              lane.layers[0].name}
            <span>
              {lane.layers.length} clip{lane.layers.length > 1 ? "s" : ""}
            </span>
          </li>
        ))}
      </ul>
      <details className="dir-plan-inputs">
        <summary>Inputs it takes</summary>
        <dl>
          <dt>{inputs.subject.label}</dt>
          <dd>
            {plan.inputs.subject}
            <span>{inputs.subject.hint}</span>
          </dd>
          <dt>{inputs.title.label}</dt>
          <dd>
            {plan.inputs.title}
            <span>{inputs.title.hint}</span>
          </dd>
          <dt>Format</dt>
          <dd>{inputs.aspects.join(" or ")}</dd>
          {inputs.bpm && (
            <>
              <dt>Tempo</dt>
              <dd>
                {inputs.bpm.min} to {inputs.bpm.max} BPM; this project is at{" "}
                {project.composition.bpm ?? inputs.bpm.default}.
              </dd>
            </>
          )}
          {inputs.acoustic && (
            <>
              <dt>Room</dt>
              <dd data-room>
                {acousticLabel(plan.inputs.acoustic ?? inputs.acoustic)}
              </dd>
            </>
          )}
          {template.references.map((ref) => (
            <div key={ref.id}>
              <dt>{ref.label}</dt>
              <dd>{ref.hint}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

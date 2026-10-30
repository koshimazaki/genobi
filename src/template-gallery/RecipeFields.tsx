import { useMemo } from "react";
import {
  mechanicalControls,
  PROMPT_LIMIT,
} from "../../shared/templates/mechanical";
import {
  planTemplate,
  SUBJECT_LIMIT,
  templateEntries,
} from "../../shared/templates/plan";
import type { HouseTemplate } from "../../shared/templates/types";
import { registry } from "../../shared/registry";
import type { AspectRatio } from "../../shared/types";
import type { MechanicalRun } from "./useMechanicalRun";

const label = (id: string) => registry.find((e) => e.id === id)?.label ?? id;

/**
 * A mechanical template's recipe: its one prompt, editable, and the
 * entry's key controls (ratio and length). The resolution is the recipe's.
 */
export function MechanicalFields({
  template,
  run,
  disabled,
}: {
  template: HouseTemplate;
  run: MechanicalRun;
  disabled: boolean;
}) {
  const { entry, resolution, lengths, aspects } = useMemo(
    () => mechanicalControls(template),
    [template],
  );
  const recipe = run.recipe!;
  const set = (patch: Partial<typeof recipe>) =>
    run.setRecipe({ ...recipe, ...patch });
  return (
    <section className="template-recipe" aria-label="Prompt and controls">
      <h3>Prompt</h3>
      <textarea
        className="template-prompt"
        aria-label={`${template.name} prompt`}
        value={recipe.prompt}
        maxLength={PROMPT_LIMIT}
        placeholder={
          template.generation
            ? "Describe how the start image moves: action, camera, light."
            : undefined
        }
        rows={7}
        disabled={disabled}
        onChange={(e) => set({ prompt: e.target.value })}
      />
      <div className="template-controls">
        <span className="template-model">
          {entry.label} · {resolution}
        </span>
        <label>
          Ratio
          <select
            value={recipe.aspect}
            disabled={disabled}
            onChange={(e) => set({ aspect: e.target.value as AspectRatio })}
          >
            {aspects.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Length
          <select
            value={recipe.duration}
            disabled={disabled}
            onChange={(e) => set({ duration: Number(e.target.value) })}
          >
            {lengths.map((n) => (
              <option key={n} value={n}>
                {n} s
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

/**
 * An agent template's recipe: the brief is editable, and each shot's prompt
 * is shown as the planner writes it from that brief, read-only, since the
 * agent sends it step by step.
 */
export function AgentFields({
  template,
  brief,
  onBrief,
  disabled,
}: {
  template: HouseTemplate;
  brief: string;
  onBrief: (brief: string) => void;
  disabled: boolean;
}) {
  const shots = useMemo(() => {
    try {
      return planTemplate(template, { subject: brief }).shots;
    } catch {
      return planTemplate(template).shots;
    }
  }, [template, brief]);
  return (
    <section className="template-recipe" aria-label="Brief and prompts">
      <h3>
        <label htmlFor={`brief-${template.id}`}>
          {template.inputs.subject.label}
        </label>
      </h3>
      <input
        id={`brief-${template.id}`}
        className="template-brief"
        aria-label={template.inputs.subject.label}
        value={brief}
        maxLength={SUBJECT_LIMIT}
        title={template.inputs.subject.hint}
        disabled={disabled}
        onChange={(e) => onBrief(e.target.value)}
      />
      <h3>Prompts · read-only</h3>
      <div className="template-prompts" tabIndex={0} aria-label="Shot prompts">
        {shots.map((shot) => (
          <p key={shot.id}>
            <strong>
              {shot.label} ·{" "}
              {shot.seconds % 1 ? shot.seconds.toFixed(1) : shot.seconds} s ·{" "}
              {shot.entry.label}
            </strong>{" "}
            {shot.prompt}
          </p>
        ))}
      </div>
      <p className="template-metadata">
        Recipe models: {templateEntries(template).map(label).join(" · ")}
      </p>
    </section>
  );
}

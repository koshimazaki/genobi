import { readyEntry } from "../../shared/registry";
import type {
  HouseTemplate,
  TemplateInputs,
} from "../../shared/templates/types";
import { versionSlots } from "../../shared/templates/version";
import type { Bundle } from "./bundle";
import { projectPlan } from "./house-template";

export default function VersionPlan({
  template,
  bundle,
  make,
  inputs,
  needsAgent,
}: {
  template: HouseTemplate;
  bundle: Bundle;
  make: string[];
  inputs: TemplateInputs;
  needsAgent: boolean;
}) {
  const shots = template.mix ? [] : projectPlan(template, bundle.project).shots;
  return (
    <section aria-label="Generation plan" className="dir-version-plan">
      <p>
        {needsAgent
          ? "Your agent reviews the current files, requested replacements and timeline. It shows the actual route, quotes and total before any paid step. Keeping existing media needs no generation."
          : "You are keeping the current media. Apply your swaps and words to continue editing here. No agent or paid generation is needed."}
      </p>
      <dl className="dir-version-words-review">
        <dt>{template.inputs.subject.label}</dt>
        <dd>{inputs.subject}</dd>
        <dt>{template.inputs.title.label}</dt>
        <dd>{inputs.title}</dd>
      </dl>
      <ul>
        {versionSlots(template).map((slot) => {
          const entry =
            slot.reference?.madeWith && readyEntry(slot.reference.madeWith);
          return (
            <li key={slot.id}>
              <strong>{slot.label}</strong> ·{" "}
              {make.includes(slot.id)
                ? "Generate replacement"
                : "Reuse current media"}
              {make.includes(slot.id) && entry
                ? ` · suggested ${entry.label}, ${entry.route}`
                : ""}
            </li>
          );
        })}
      </ul>
      <ol>
        {shots.map((shot) => (
          <li key={shot.id}>
            <strong>{shot.label}</strong> · {shot.entry.label} ·{" "}
            {shot.entry.open ? "Open weights" : "API"} · {shot.entry.route} ·{" "}
            {shot.input.duration} s
            <p>
              Agent prepares the current recipe and requests approval before
              spending.
            </p>
          </li>
        ))}
      </ol>
      {template.takes?.map((take) => (
        <p key={take.id}>
          {take.label} · World Builder capture and room processing through your
          local studio.
        </p>
      ))}
      {needsAgent && (
        <p>
          Results return through the linked project with revision checks.
          Existing media stays in place until an approved replacement is
          available.
        </p>
      )}
    </section>
  );
}

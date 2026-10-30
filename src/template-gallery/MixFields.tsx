import type { HouseTemplate } from "../../shared/templates/types";

/**
 * A mix template's drawer section: what the finished cut is made of, in
 * place of a brief and prompts, since a mix generates nothing.
 */
export default function MixFields({ template }: { template: HouseTemplate }) {
  const mix = template.mix;
  if (!mix) return null;
  const { cut } = mix;
  const recipes = [...new Set(cut.layers.map((l) => l.module))];
  const slices = cut.shots.filter((s) => s.cropY !== null);
  const clips = new Set(slices.map((s) => s.asset)).size;
  return (
    <section className="template-recipe" aria-label="The cut">
      <h3>The cut</h3>
      <p>
        {slices.length} slices of {clips} bundled clips and an end card, cut on
        the bar at {cut.bpm} BPM to the track from {cut.inPointSeconds} s.
      </p>
      <p>Overlays: {recipes.join(", ")}.</p>
    </section>
  );
}

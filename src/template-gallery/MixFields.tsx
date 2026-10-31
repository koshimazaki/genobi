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
  // cropY only describes a square source's crop. Landscape shots are still
  // real shots, including every shot in Adaptive reverb and Bloom.
  const clips = new Set(cut.shots.map((s) => s.asset)).size;
  return (
    <section className="template-recipe" aria-label="The cut">
      <h3>The cut</h3>
      <p>
        {cut.shots.length} shots from {clips} bundled video{" "}
        {clips === 1 ? "source" : "sources"}. Timeline at {cut.bpm} BPM; source
        track starts at {cut.inPointSeconds} s.
      </p>
      <p>Overlays: {recipes.join(", ")}.</p>
    </section>
  );
}

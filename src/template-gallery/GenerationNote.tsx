import type { TemplateGeneration } from "../../shared/templates/types";

/** Said on every generation card: the route takes one kind of key. */
export const BFL_ONLY =
  "FLUX 3 image to video runs on BFL direct, so it needs a BFL key. Without one, Generate's quote says so and nothing is spent.";

/**
 * What a generation card may say about its clip. Only an owner-recorded
 * start image and prompt let it say the clip was made from them; until
 * then the clip is preview footage, named only by the model the owner said
 * made it.
 */
export const generationClaim = (
  generation: TemplateGeneration,
  /** "made with FLUX 3 video (API)": the clip's model, when recorded. */
  madeWith = "",
) =>
  generation.recorded
    ? "Made from this start image and prompt with FLUX 3 image to video."
    : `Preview footage${madeWith ? `, ${madeWith}` : ""}. The start image and prompt that made it are not recorded yet: drop a start image and write a prompt to generate your own.`;

export default function GenerationNote({
  generation,
  madeWith,
}: {
  generation: TemplateGeneration;
  madeWith?: string;
}) {
  return (
    <>
      <p className="template-demo-note">
        {generationClaim(generation, madeWith)}
      </p>
      <p className="template-metadata">{BFL_ONLY}</p>
    </>
  );
}

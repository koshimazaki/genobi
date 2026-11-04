import type { SlotRecipe } from "../../shared/templates/types";

/**
 * The image a template's bundled take started from (`mix.recipes`), shown
 * beside the slot so the person sees what made the shot. Static public media:
 * nothing is loaded into the project or sent anywhere.
 */
export default function SlotFirstStill({
  recipe,
  label,
}: {
  recipe: SlotRecipe;
  label: string;
}) {
  const what = recipe.referenceLabel ?? "First still";
  return (
    <figure className="dir-version-first-still">
      <img
        src={recipe.reference}
        alt={`${what} that made ${label}`}
        loading="lazy"
        width={112}
        height={63}
      />
      {recipe.guide && (
        <img
          src={recipe.guide}
          alt={`Shape guide the still of ${label} was made from`}
          loading="lazy"
          width={112}
          height={63}
        />
      )}
      <figcaption>
        {what}
        {recipe.guide ? " and its shape guide" : ""}
        {recipe.preset ? ` · ${recipe.preset}` : ""}
      </figcaption>
    </figure>
  );
}

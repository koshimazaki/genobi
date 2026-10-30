/** Neutral subjects; selecting one leaves the saved scene intact. */
import { CHARACTER_MODELS } from "./character-catalog";
import { isBoundary } from "./bounds";
import { parseScene, fail } from "./parse";
import type { SceneSpec } from "./types";
export type SubjectChoice = "saved" | "mannequin" | "pug" | "creature" | "blob";
export function sceneSubject(
  base: SceneSpec,
  choice: SubjectChoice,
): SceneSpec {
  if (choice === "saved") return base;
  const objects = base.objects.filter((p) => !p.hero || isBoundary(p));
  const floor =
    base.id === "set" ? 0.36 : base.id === "acoustic-room" ? 0.18 : 0;
  if (choice === "blob" && objects.length >= 200)
    fail("Make room for the blob: this scene already has 200 primitives.");
  const asset = choice === "blob" ? "mannequin" : choice;
  return parseScene({
    ...base,
    ...(choice !== "blob"
      ? {
          summary: `${base.characters?.length || 1} ${asset === "creature" ? "Glitch Candies creature characters with their original appearance" : `neutral ${asset === "pug" ? "dog" : "human"} figures`} in the existing environment. Preserve the first frame's architecture and terrain.`,
        }
      : {}),
    ...(choice === "blob"
      ? {
          summary: `${base.label}. One neutral abstract blob in the existing environment.`,
        }
      : {}),
    ...(base.id === "set"
      ? { scale: 0.5, subject: [base.subject[0], 0.6, base.subject[2]] }
      : {}),
    objects:
      choice === "blob"
        ? [
            ...objects,
            {
              shape: "sphere",
              position: [base.subject[0], floor + 0.6, base.subject[2]],
              size: [0.6, 0.6, 0.6],
              colour: "subject",
              material: "plaster",
              hero: true,
            },
          ]
        : objects,
    characters:
      choice === "blob"
        ? []
        : base.characters?.length
          ? base.characters.map((c) => ({
              ...c,
              asset,
              pose: c.pose in CHARACTER_MODELS[asset].clips ? c.pose : "idle",
            }))
          : [
              {
                id: "lead",
                asset,
                pose: "idle",
                position: [base.subject[0], floor, base.subject[2]],
                rotationY: 0,
                scale: 1,
              },
            ],
  });
}

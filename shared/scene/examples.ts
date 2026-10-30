/** Examples first: deterministic, editable combinations rather than opaque models. */
import type { SceneCharacter } from "./characters";
import { primitiveBounds, union, wallBounds } from "./bounds";
import {
  forest,
  mountains,
  street,
  interior,
  explodedHouse,
} from "./example-parts";
import { createScene } from "./commands";
import { oneOf, parseScene } from "./parse";
import type { SceneSpec } from "./types";

export const EXAMPLE_IDS = [
  "cathedral",
  "house-interior",
  "exploded-house",
  "neo-tokyo-street",
  "mountains",
  "forest",
  "forest-meeting",
  "forest-companion",
  "city-meeting",
] as const;
export type ExampleId = (typeof EXAMPLE_IDS)[number];
export const SURROUNDINGS = ["none", "forest", "mountains", "city"] as const;
export const CASTS = ["none", "solo", "pair"] as const;
export const SCENE_EXAMPLES = [
  {
    id: "cathedral",
    label: "Cathedral interior",
    summary: "Columns, pews, altar and a human scale reference.",
    scale: 0.5,
  },
  {
    id: "house-interior",
    label: "House interior",
    summary: "A furnished room for interior layout and acoustics.",
    scale: 0.28,
  },
  {
    id: "exploded-house",
    label: "Exploded house",
    summary: "Separate foundation, floors, walls, roof and furniture.",
    scale: 1.2,
  },
  {
    id: "neo-tokyo-street",
    label: "Neo Tokyo street",
    summary:
      "Primitive buildings, glowing signs, sidewalks and a clear street.",
    scale: 1.2,
  },
  {
    id: "mountains",
    label: "Mountain valley",
    summary: "Layered peaks for wide shots and foreground parallax.",
    scale: 3,
  },
  {
    id: "forest",
    label: "Forest clearing",
    summary: "Trees around a clearing, ready for characters and camera moves.",
    scale: 0.36,
  },
  {
    id: "forest-meeting",
    label: "Two characters · forest",
    summary: "Two bundled mannequins facing each other in a clearing.",
    scale: 0.36,
  },
  {
    id: "forest-companion",
    label: "Mannequin & dog · forest",
    summary:
      "A neutral mannequin and dog facing each other in a forest clearing.",
    scale: 0.36,
  },
  {
    id: "city-meeting",
    label: "Character encounter · city",
    summary: "Two mannequins in a street of primitive buildings and signs.",
    scale: 0.36,
  },
] as const;

export function exampleCharacters(
  cast: (typeof CASTS)[number],
): SceneCharacter[] {
  if (cast === "none") return [];
  const actor = (
    id: string,
    x: number,
    rotationY: number,
    pose: SceneCharacter["pose"],
  ): SceneCharacter => ({
    id,
    asset: "mannequin",
    pose,
    position: [x, 0, 0],
    rotationY,
    scale: 1,
  });
  return cast === "solo"
    ? [actor("lead", 0, 0, "idle")]
    : [
        actor("lead", -1, Math.PI / 2, "talk"),
        actor("partner", 1, -Math.PI / 2, "interact"),
      ];
}

export function exampleScene(
  id: unknown,
  options: { surroundings?: unknown; cast?: unknown } = {},
): SceneSpec {
  const chosen = oneOf(id, EXAMPLE_IDS, "scene example");
  const entry = SCENE_EXAMPLES.find((e) => e.id === chosen)!;
  const surroundings =
    options.surroundings === undefined
      ? "none"
      : oneOf(options.surroundings, SURROUNDINGS, "surroundings");
  const cast =
    options.cast === undefined
      ? chosen.endsWith("meeting")
        ? "pair"
        : chosen === "exploded-house" || chosen === "mountains"
          ? "none"
          : "solo"
      : oneOf(options.cast, CASTS, "cast");
  const objects =
    chosen === "cathedral"
      ? interior(true)
      : chosen === "house-interior"
        ? interior()
        : chosen === "exploded-house"
          ? explodedHouse()
          : chosen === "neo-tokyo-street" || chosen === "city-meeting"
            ? street()
            : chosen === "mountains"
              ? mountains()
              : forest();
  const baseEnvironment = chosen.startsWith("forest")
    ? "forest"
    : chosen.includes("city") || chosen.includes("tokyo")
      ? "city"
      : chosen === "mountains"
        ? "mountains"
        : "none";
  const companion = surroundings === baseEnvironment ? "none" : surroundings;
  const extra =
    companion === "forest"
      ? forest()
      : companion === "mountains"
        ? mountains()
        : companion === "city"
          ? street()
          : [];
  const walls = wallBounds({ objects });
  const companionBounds = union(extra.map(primitiveBounds));
  const offsetX =
    walls && companionBounds ? walls.max[0] - companionBounds.min[0] + 3 : 0;
  // Prefix companion parts so hybrids keep stable, unique edit handles.
  return parseScene({
    ...createScene(chosen, entry.label),
    summary: entry.summary,
    scale: entry.scale,
    subject: chosen === "exploded-house" ? [0, 4, 0] : [0, 0.6, 0],
    fov: chosen === "mountains" ? 55 : 42,
    objects: [
      ...objects,
      ...extra.map((p) => ({
        ...p,
        id: `extra-${p.id}`,
        position: [p.position[0] + offsetX, p.position[1], p.position[2]],
      })),
    ],
    characters:
      chosen === "forest-companion" && cast !== "none"
        ? [
            ...exampleCharacters(cast).map((c, i) =>
              i === 0
                ? { ...c, rotationY: Math.PI / 2, pose: "interact" as const }
                : c,
            ),
            {
              id: "pet",
              asset: "pug",
              pose: "idle",
              position: cast === "pair" ? [0, 0, 2] : [1.6, 0, 0],
              rotationY: cast === "pair" ? Math.PI : -Math.PI / 2,
              scale: 1,
            },
          ]
        : exampleCharacters(cast),
  });
}

import {
  storyBox,
  storyFloor,
  storyStreet,
  type StoryPart,
} from "./story-layouts";

/** Metre-based stacked interiors. Every level keeps a visible shaft opening. */
export function descentParts(): StoryPart[] {
  const parts = [
    ...storyFloor(40, 64, 64, 12, 20),
    ...storyStreet(40),
    ...storyFloor(12, 24, 36, 8, 12, 0.6),
  ];
  const stone = { color: "#cabfa4" },
    gold = { color: "#d7b66d" },
    club = { color: "#333349" },
    studio = { color: "#a7997a" };
  // Cathedral: broad nave, tall walls, piers, pointed ribs and an apse window.
  for (const side of [-1, 1]) {
    parts.push(storyBox(side * 12.3, 26, 0, 0.6, 28, 36, "structure", stone));
    for (const z of [-12, 0, 12]) {
      parts.push(storyBox(side * 8.5, 23, z, 1.4, 22, 1.4, "structure", stone));
      if (z !== 0)
        parts.push(
          storyBox(side * 4.5, 36.2, z, 11.5, 0.65, 0.85, "trim", {
            ...gold,
            rotationZ: side * -0.58,
          }),
        );
    }
    parts.push(storyBox(side * 8, 26, 18.3, 8, 28, 0.6, "structure", stone));
  }
  parts.push(
    storyBox(0, 26, -18.3, 24, 28, 0.6, "structure", stone),
    storyBox(0, 34, 18.3, 8, 12, 0.6, "structure", stone),
    storyBox(0, 29, -17.9, 6, 12, 0.4, "trim", { color: "#66aebc" }),
    storyBox(0, 29, -17.6, 0.45, 12, 0.4, "trim", gold),
    storyBox(0, 29, -17.6, 6, 0.45, 0.4, "trim", gold),
  );
  // Club: the shaft leaves a floor ring with a DJ booth and speaker stacks.
  parts.push(
    ...storyFloor(4, 16, 20, 4, 6, 0.4),
    storyBox(-8.2, 8, 0, 0.4, 8, 20, "structure", club),
    storyBox(8.2, 8, 0, 0.4, 8, 20, "structure", club),
    storyBox(0, 8, -10.2, 16, 8, 0.4, "structure", club),
    storyBox(-5, 8, 10.2, 6, 8, 0.4, "structure", club),
    storyBox(5, 8, 10.2, 6, 8, 0.4, "structure", club),
    storyBox(0, 10, 10.2, 4, 4, 0.4, "structure", club),
    storyBox(0, 4.8, -7.5, 5.5, 1.6, 1.6, "structure", { color: "#5f6974" }),
    storyBox(0, 5.7, -7.5, 5.8, 0.25, 1.8, "trim", { color: "#72bfc3" }),
    storyBox(-5.5, 5.8, -7.4, 1.5, 3.6, 1.3, "structure", { color: "#242732" }),
    storyBox(5.5, 5.8, -7.4, 1.5, 3.6, 1.3, "structure", { color: "#242732" }),
    storyBox(-7.7, 10.5, 0, 0.35, 0.5, 18, "trim", { color: "#73c9ce" }),
    storyBox(7.7, 10.5, 0, 0.35, 0.5, 18, "trim", { color: "#bd87b7" }),
  );
  // Studio: a human-size room, a desk, monitors and a sofa; no inferred people.
  parts.push(
    storyBox(0, -0.15, 0, 8, 0.3, 10, "structure", studio),
    storyBox(-4.15, 2, 0, 0.3, 4, 10, "structure", studio),
    storyBox(4.15, 2, 0, 0.3, 4, 10, "structure", studio),
    storyBox(0, 2, -5.15, 8, 4, 0.3, "structure", studio),
    storyBox(-3, 2, 5.15, 2, 4, 0.3, "structure", studio),
    storyBox(3, 2, 5.15, 2, 4, 0.3, "structure", studio),
    storyBox(0, 3.2, 5.15, 4, 1.6, 0.3, "structure", studio),
    storyBox(0, 0.9, -3.5, 3.6, 0.2, 1.2, "structure", { color: "#414956" }),
    storyBox(0, 0.45, -3.5, 2.8, 0.9, 0.65, "structure", { color: "#596570" }),
    storyBox(0, 1.55, -3.7, 1.8, 1.1, 0.16, "trim", { color: "#73c9ce" }),
    storyBox(-2.8, 0.5, 0, 1.6, 1, 3.2, "structure", { color: "#5b7778" }),
    storyBox(-3.4, 1, 0, 0.4, 1.8, 3.2, "structure", { color: "#5b7778" }),
  );
  return parts;
}

export function avenueParts(): StoryPart[] {
  const parts = [
    storyBox(0, -0.4, 0, 64, 0.8, 64, "structure", { color: "#252d39" }),
    ...storyStreet(0),
  ];
  for (const z of [-24, -12, 0, 12, 24])
    parts.push(
      storyBox(0, -0.045, z, 0.25, 0.1, 6, "trim", { color: "#d4c5a2" }),
    );
  return parts;
}

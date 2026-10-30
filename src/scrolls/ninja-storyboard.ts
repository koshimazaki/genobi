import type { ScrollExample } from "./example-catalog";

const RECIPES = "custom_nodes/director_world_builder/examples/storyboard/ninja";

/** One panel's text in the Sky Gate sheet's rows, and its World Builder frame. */
function panel(
  n: number,
  shot: string,
  beat: string,
  camera: string,
  action: string,
  rhythm: string,
  escalation: string,
  look: string,
) {
  const id = `p0${n}`;
  return {
    prompt: [
      `P0${n} / ${shot}. Beat: ${beat}.`,
      `Camera path: ${camera}. Action path: ${action}.`,
      `Rhythm: ${rhythm}. Escalation: ${escalation}.`,
      look,
    ].join(" "),
    frame: `ninja/${id}.png`,
    recipe: `${RECIPES}/${id}.json`,
  };
}

/**
 * Four Rooms: eight World Builder scenes, one animated mannequin, laid out
 * like the Sky Gate sheet. Each panel carries its captured first frame, which
 * Fill panels sends as that panel's own reference (`panel-frames.ts`).
 */
export const ninjaRooms: ScrollExample = {
  name: "Four Rooms · eight-shot 3D storyboard",
  file: "ninja-rooms.png",
  made: "Genobi's World Builder",
  capture: true,
  plan: {
    prompt:
      "A lone ninja crosses an open field, slips into a cathedral, rushes past a stone guardian, drops into an empty club, strikes in a small study, forms a seal in the hall and rises out of the nave. Black-and-white ink storyboard frames, one per panel, each redrawn from its own 3D blocking frame.",
    shots: [
      ["Field approach", "Low track forward", "Run"],
      ["Field orbit", "Aerial arc", "Run the line"],
      ["Nave reveal", "Orbit 180", "Stance"],
      ["Statue rush", "Side track", "Rush past"],
      ["Club drop", "Low track", "Land / crouch"],
      ["Strike", "Push in", "Punch"],
      ["Seal", "Over the shoulder", "Spell / charge"],
      ["Release", "Crane up", "Release / settle"],
    ],
    panels: [
      panel(
        1,
        "low wide / field approach",
        "01 approach",
        "low track behind, forward",
        "run toward the far gate",
        "building",
        "L1 establish",
        "Dusk, long shadows, the path vanishing ahead.",
      ),
      panel(
        2,
        "aerial track / field orbit",
        "02 orbit",
        "high wide arc around the runner",
        "run the curve of the track",
        "even, driving",
        "L2 motion",
        "Tiny figure against the wide field and the tower.",
      ),
      panel(
        3,
        "360 reveal / nave",
        "03 reveal",
        "circle the figure, half turn",
        "hold the stance",
        "one long beat",
        "L3 reveal",
        "Cathedral nave, light from the open roof.",
      ),
      panel(
        4,
        "pass-by / statue rush",
        "04 rush",
        "side track at speed",
        "rush past the guardian statue",
        "quick cuts, tapering",
        "L4 rush",
        "Stone guardian and arches blur past.",
      ),
      panel(
        5,
        "low drop / club floor",
        "05 drop",
        "low at floor level",
        "land and crouch",
        "short, settling",
        "L4 commit",
        "Empty club, low ceiling, hard floor.",
      ),
      panel(
        6,
        "impact insert / strike",
        "06 impact",
        "fast push in",
        "the strike lands",
        "one hit",
        "L5 impact",
        "Small study, close and cramped.",
      ),
      panel(
        7,
        "heroic medium / seal",
        "07 spell form",
        "over the shoulder, steady",
        "form the seal, charging",
        "rising",
        "L5 charge",
        "Hall with tall walls, energy gathering at the hands.",
      ),
      panel(
        8,
        "crane wide / release",
        "08 release",
        "crane up and back over the nave",
        "release and settle",
        "one held beat",
        "L5 release",
        "Seen from high above the open nave.",
      ),
    ],
  },
};

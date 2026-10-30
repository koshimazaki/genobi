import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entriesFor, familiesFor, readyEntry } from "../shared/registry";
import { modelOptions } from "../src/components/GenerationControls";
import {
  composerBlocked,
  composerReducer,
  initialComposer,
} from "../src/useComposer";

// The composer sends no clip, character or part for the swap, so it must
// never offer Generate on it: the script and the agent's quote/submit do.
const ref = `data:image/png;base64,${readFileSync(new URL("./fixtures/reference.png", import.meta.url)).toString("base64")}`;

describe("Openjutsu's swap outside the composer", () => {
  it("is local only: the hosted studio does not list it", () => {
    expect(readyEntry("openjutsu-swap")?.localOnly).toBe(true);
    const hosted = entriesFor("h3", { hosted: true }).map((e) => e.id);
    expect(hosted).not.toContain("openjutsu-swap");
    expect(hosted).toContain("minimax-h3-router");
    expect(familiesFor({ hosted: true })).toContain("h3");
    expect(entriesFor("h3").map((e) => e.id)).toContain("openjutsu-swap");
  });

  it("is a disabled row in the local menu, naming where it runs", () => {
    const row = modelOptions("h3", false).find(
      (option) => option.value === "openjutsu-swap",
    );
    expect(row).toMatchObject({ disabled: true, tag: "agent" });
    expect(row?.note).toContain("npm run swap");
    expect(row?.note).toContain("genobi_submit");
    // The other H3 rows stay choosable.
    for (const option of modelOptions("h3", false))
      if (option.value !== "openjutsu-swap")
        expect(option.disabled).toBeUndefined();
  });

  it("keeps Generate off when a restored selection holds it", () => {
    const state = composerReducer(initialComposer, {
      type: "update",
      patch: {
        generator: "video",
        model: "openjutsu-swap",
        description: "keep the glasses",
        duration: 5,
        sourceId: "clip",
        imageReferences: [ref, ref],
      },
    });
    expect(state.model).toBe("openjutsu-swap");
    expect(composerBlocked(state, "clip", "keep the glasses")).toBe(true);
    // The same filled composer on H3 through Router can generate.
    const router = { ...state, model: "minimax-h3-router" as const };
    expect(composerBlocked(router, "clip", "keep the glasses")).toBe(false);
  });
});

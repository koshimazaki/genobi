import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  acousticSections,
  acousticCaption,
  ACOUSTIC_TEXT_LIMIT,
  type AcousticLevel,
} from "../shared/acoustic";
import {
  CAMERA_GUIDE_URL,
  H3_GUIDE_URL,
  LTX_GUIDE_URL,
  cameraSections,
  termName,
  termsFor,
} from "../shared/camera";
import { h3Sentence } from "../shared/camera-h3";
import { LTX_DURATIONS } from "../shared/comfy/ltx";
import { DIRECTOR_OPS } from "../shared/director/commands";
import { registry, type ReadyEntry } from "../shared/registry";
import { lightGroups } from "../shared/light";
import { ltxSlots } from "../shared/ltx-prompt";
import { ltxVocabulary } from "../shared/ltx-vocabulary";

// The camera skill is one card per model the registry can run, and the
// Director skill lists the commands the server parses. Both are read by
// agents that cannot check the code, so they are held to it here.
const root = "plugins/genobi/skills";
const read = (name: string) => readFileSync(`${root}/${name}/SKILL.md`, "utf8");
const camera = [
  read("genobi-camera"),
  ...["reference-video", "music"].map((name) =>
    readFileSync(`${root}/genobi-camera/references/${name}.md`, "utf8"),
  ),
].join("\n");
const director = read("genobi-director");
const ready = registry.filter((e): e is ReadyEntry => e.status === "ready");
const movements = cameraSections.find((s) => s.id === "movements")!;

/** A card: from its `### … (`id`)` heading to the next heading. */
function card(id: string) {
  const start = camera.search(new RegExp(`^### .*\\(\`${id}\`\\)$`, "m"));
  expect(start, `card for ${id}`).toBeGreaterThan(0);
  const rest = camera.slice(camera.indexOf("\n", start));
  const end = rest.search(/^##+ /m);
  return end < 0 ? rest : rest.slice(0, end);
}

describe("the genobi-camera skill", () => {
  it("has one card per ready registry entry, with its request and route", () => {
    const cards = [...camera.matchAll(/^### .*\(`([a-z0-9-]+)`\)$/gm)].map(
      (m) => m[1],
    );
    expect(cards.sort()).toEqual(ready.map((e) => e.id).sort());
    for (const entry of ready) {
      const text = card(entry.id);
      expect(text, entry.id).toContain(`"generator": "${entry.generator}"`);
      expect(text, entry.id).toContain(`"model": "${entry.videoModel}"`);
      expect(text, entry.id).toContain(
        `\`${entry.route}\`, \`${entry.model}\``,
      );
      expect(text, entry.id).toMatch(/\| Cost +\| Quote first\./);
      // Entries with no camera say so; the rest name their wording.
      if (!entry.camera) expect(text, entry.id).toMatch(/\| Camera +\| None/);
    }
  });

  it("names every entry that is not runnable yet, and quotes none of them", () => {
    for (const entry of registry.filter((e) => e.status === "coming")) {
      expect(camera, entry.id).toContain(`\`${entry.id}\``);
      expect(camera, entry.id).not.toContain(`"model": "${entry.id}"`);
    }
  });

  it("carries LTX's eleven moves in LTX's names and sentences", () => {
    const ltx = termsFor(movements, "ltx-2.5");
    expect(ltx).toHaveLength(11);
    expect(camera).toContain("### The eleven LTX moves");
    for (const term of ltx)
      expect(camera).toMatch(
        new RegExp(
          `\\| \`${term.id}\` +\\| ${termName(term, "ltx-2.5")} +\\| ${escape(term.ltx)} +\\|`,
        ),
      );
    // The guide's rules, as docs/camera-wording.md states them.
    expect(camera).toContain("one flowing present-tense paragraph");
    expect(camera).toContain("relative to the subject");
    expect(camera).toContain("how the subject appears after the move");
  });

  it("orders the LTX paragraph as the guide does, with its rules", () => {
    const order = [
      "Establish the shot",
      "Set the scene",
      "Describe the action",
      "Define the character(s)",
      "Identify the camera movement",
      "Describe the audio",
    ].map((name) => camera.indexOf(`**${name}**`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(camera).toContain("10 August 2026");
    expect(camera).toContain("as a natural sequence");
    expect(camera).toContain("**physical cues**");
    expect(camera).toContain("quotation marks");
  });

  it("carries every Light term with its group and studio sentence", () => {
    for (const group of lightGroups)
      for (const term of group.terms)
        expect(camera).toMatch(
          new RegExp(
            `\\| \`${term.id}\` +\\| ${group.label} +\\| ${escape(term.label)} +\\| ${escape(term.ltx)} +\\|`,
          ),
        );
  });

  it("lists each gap's vocabulary as shared/ltx-vocabulary.ts has it", () => {
    for (const slot of ltxSlots) {
      expect(camera).toContain(`**${slot.label}** — ${slot.hint}`);
      for (const group of ltxVocabulary[slot.id]) {
        const studio = group.source === "studio" ? " (studio-authored)" : "";
        expect(camera).toContain(
          `${group.label}${studio}: ${group.chips.map((c) => c.label).join(" · ")}`,
        );
      }
    }
  });

  it("carries FLUX's ten moves in BFL's clauses", () => {
    const flux = termsFor(movements, "flux-3");
    expect(flux).toHaveLength(10);
    for (const term of flux)
      expect(camera).toMatch(
        new RegExp(
          `\\| \`${term.id}\` +\\| ${term.label} +\\| ${escape(term.clause)} +\\|`,
        ),
      );
  });

  it("carries H3's thirteen moves in H3's names and sentences, and its order", () => {
    const h3 = termsFor(movements, "minimax-h3-router");
    expect(h3).toHaveLength(13);
    expect(camera).toContain("### The thirteen H3 moves");
    for (const term of h3)
      expect(camera).toMatch(
        new RegExp(
          `\\| \`${term.id}\` +\\| ${escape(termName(term, "minimax-h3-router"))} +\\| ${escape(h3Sentence(term.id)!)} +\\|`,
        ),
      );
    // The skill says H3's framing is LTX's sentences; hold it to that.
    for (const section of cameraSections.filter((s) => s !== movements))
      for (const term of termsFor(section, "minimax-h3-router")) {
        expect(camera, term.id).toContain(`\`${term.id}\``);
        expect(h3Sentence(term.id), term.id).toBe(term.ltx);
      }
    expect(camera).toContain("**H3's order**");
    expect(camera).toContain("never writes bracket commands");
  });

  it("gives both wordings for every shot size and angle LTX offers", () => {
    for (const section of cameraSections.filter((s) => s !== movements)) {
      const ltx = termsFor(section, "ltx-2.5");
      for (const term of section.terms) {
        expect(camera, term.id).toContain(term.clause);
        if (ltx.includes(term)) expect(camera, term.id).toContain(term.ltx);
        else
          expect(camera, term.id).toMatch(
            new RegExp(`\\| \`${term.id}\` .*\\| Not for LTX`),
          );
      }
    }
  });

  it("links each model family to its own guide", () => {
    for (const id of [
      "flux-3-klein",
      "flux-3-klein-api",
      "flux-3-image",
      "flux-3-edit",
    ])
      expect(card(id), id).toContain(
        "https://docs.bfl.ai/guides/prompting_unified_building",
      );
    for (const id of ["flux-3-klein", "flux-3-klein-api"])
      expect(card(id), id).toContain(
        "https://docs.bfl.ai/flux_3/flux3_image_klein",
      );
    const guides = {
      "ltx-2.5": LTX_GUIDE_URL,
      "flux-3": CAMERA_GUIDE_URL,
      "minimax-h3": H3_GUIDE_URL,
    };
    for (const entry of ready.filter((e) => e.camera))
      expect(card(entry.id), entry.id).toContain(guides[entry.camera!]);
  });

  it("states LTX's lengths and the AKUSPACE treatment the server accepts", () => {
    expect(card("ltx-2-5-fast")).toContain(
      LTX_DURATIONS.join(", ").replace(/, (\d+)$/, " or $1"),
    );
    const akuspace = card("ltx-2-5-akuspace");
    expect(akuspace).toContain("Seven studio ratios");
    expect(akuspace).toContain("193 frames");
    expect(akuspace).toMatch(/Router runs no LoRA/);
    for (const section of acousticSections) {
      expect(akuspace).toContain(`\`${section.id}\``);
      for (const preset of section.presets)
        expect(akuspace, preset).toContain(`\`${preset}\``);
      for (const level of section.levels)
        expect(akuspace, level).toContain(`\`${level}\``);
    }
    // Audio input and segments are planned, not cards.
    expect(akuspace).not.toContain("/issues/");
    expect(akuspace).not.toContain("/issues/");
  });
});

describe("the genobi-director skill", () => {
  it("lists exactly the Director commands the server parses", () => {
    const table = [
      ...director
        .slice(director.indexOf("## Director commands"))
        .matchAll(/^\| `([a-z-]+)` +\|/gm),
    ].map((m) => m[1]);
    expect(table.sort()).toEqual([...DIRECTOR_OPS].sort());
  });

  it("leads to the other skills, and the entry skill leads to it", () => {
    for (const name of ["genobi-studio", "genobi-camera"])
      expect(director).toContain(`\`${name}\``);
    const studio = read("genobi-studio");
    for (const name of ["genobi-director", "genobi-camera"])
      expect(studio).toContain(`\`${name}\``);
    // The entry skill points to the Director rather than repeating it.
    expect(studio).not.toContain("set-placement");
  });
});

describe("plugin skill links", () => {
  const repo = "https://github.com/koshimazaki/Genobi/";
  it("resolve to files in this repository", () => {
    let checked = 0;
    for (const name of readdirSync(root)) {
      const file = `${root}/${name}/SKILL.md`;
      const text = readFileSync(file, "utf8");
      for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        let local: string | null = null;
        if (target.startsWith(`${repo}blob/main/`))
          local = target.slice(`${repo}blob/main/`.length);
        else if (target.startsWith(`${repo}tree/main/`))
          local = target.slice(`${repo}tree/main/`.length);
        else if (!/^[a-z]+:/.test(target))
          local = path.join(path.dirname(file), target);
        if (local === null) continue;
        const clean = local.split("#")[0];
        expect(existsSync(clean), `${name} links ${target}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });
});

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

describe("the genobi-akuspace skill", () => {
  it("keeps its copied vocabulary, captions and limits tied to the acoustic schema", () => {
    const skill = read("genobi-akuspace");
    for (const section of acousticSections) {
      expect(skill).toContain(`\`${section.id}\``);
      for (const level of section.levels)
        expect(skill).toContain(`\`${level}\``);
      for (const preset of section.presets) {
        expect(skill).toContain(`\`${preset}\``);
        expect(skill).toContain(
          acousticCaption({
            mode: section.id,
            preset,
            level: (section.id === "room" ? "mid" : "low") as AcousticLevel,
          }),
        );
      }
    }
    expect(skill).toContain(String(ACOUSTIC_TEXT_LIMIT));
    expect(skill).not.toContain("/issues/");
    expect(skill).not.toContain("/issues/");
  });
});

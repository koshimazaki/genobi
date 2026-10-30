import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { viewParameter, type MixSpec } from "../shared/templates/mix";
import {
  cursorFor,
  focusFor,
  sectionsFrom,
  moveFor,
  sliceFor,
  zoomFor,
  type Footage,
} from "../scripts/lib/teaser-run/footage";
import { REFERENCES } from "../scripts/lib/teaser-run/verify";

// The teaser run kit (docs/genobi-teaser-run/) is read by a weak model that
// cannot check the code, so its storyboard, rules, examples and helper are
// held to the v2 cut and to the rule-derived dry-run cut.
const KIT = "docs/genobi-teaser-run/";
const v2 = JSON.parse(readFileSync(REFERENCES.v2, "utf8")) as MixSpec;
// The capture log v2 was cut from; later recordings rewrite the live log
// (docs/genobi-teaser-footage.json), so the v2 checks read this copy.
const footage = JSON.parse(
  readFileSync("tests/fixtures/teaser-run/footage-v2.json", "utf8"),
) as Footage;
const shotOf = (beat: number) =>
  v2.shots.find((s) => s.startBeat <= beat && beat < s.startBeat + s.beats)!;

describe("the helper", () => {
  it("reproduces the v2 pointers from the capture log, with their view", () => {
    const cursors = v2.layers.filter((l) => l.module === "ui-cursor");
    expect(cursors).toHaveLength(16);
    for (const l of cursors) {
      const shot = shotOf(l.startBeat);
      const got = cursorFor(
        footage,
        shot.asset,
        shot.sourceSeconds,
        l.beats,
        135,
      )!;
      // v2 wrote one time as "1.0"; the helper writes "1".
      const path = String(l.parameters.path).replace(/(\d)\.0:/g, "$1:");
      expect(
        { ...got, view: viewParameter(v2, shot, l.startBeat) },
        l.id,
      ).toEqual({
        ...l.parameters,
        path,
      });
    }
  });

  it("boxes a logged element and moves onto its centre", () => {
    const focus = v2.layers.find((l) => l.id === "focus-44")!;
    const box = focusFor(
      footage,
      "ui-camera",
      "upscale family",
      String(focus.parameters.label),
      focus.beats,
      135,
    );
    expect(box).toMatchObject({
      x: 0.301,
      w: 0.02,
      h: 0.03,
      fadeAt: focus.parameters.fadeAt,
    });
    expect(moveFor(footage, "ui-camera", "upscale family")).toEqual({
      x: 0.31,
      y: 0.74,
      zoom: 2.2,
      ease: 2,
      drift: 0.03,
    });
    expect(zoomFor(footage, "ui-world", "orbit").zoom).toBe(1.35);
    expect(() => zoomFor(footage, "ui-camera", "nothing")).toThrow(
      /Labels: families/,
    );
  });

  it("prints what the skill tells a run to expect", () => {
    // SKILL.md step 4: a mismatch stops the run, so these must hold.
    expect(
      sliceFor(footage, "ui-camera", "families", "h3 family", 135),
    ).toMatchObject({
      sourceSeconds: 0.2,
      beats: 11,
    });
    expect(moveFor(footage, "ui-camera", "upscale family")).toEqual({
      x: 0.31,
      y: 0.74,
      zoom: 2.2,
      ease: 2,
      drift: 0.03,
    });
    const skill = readFileSync(
      "plugins/genobi/skills/genobi-teaser-run/SKILL.md",
      "utf8",
    );
    expect(skill).toContain('Expected: `"sourceSeconds": 0.2, "beats": 11`');
    expect(skill).toContain(
      '`{"x": 0.31, "y": 0.74, "zoom": 2.2, "ease": 2, "drift": 0.03}`',
    );
    expect(skill).toContain(
      "45 shots, 59 overlays, 127 layers in the Director",
    );
    const d = derived;
    expect([d.shots.length, d.layers.length]).toEqual([45, 59]);
  });

  it("turns the analyser's drops into bars, leaving off-bar ones out", () => {
    const a = JSON.parse(readFileSync(`${KIT}track-analysis.json`, "utf8"));
    const s = sectionsFrom({
      durationSeconds: a.durationSeconds,
      grid: { bpm: a.bpm, periodSeconds: a.periodSeconds },
      downbeat: { firstDownbeatSeconds: a.firstDownbeatSeconds },
      moments: a.drops.map((d: { seconds: number; changeDb: number }) => ({
        kind: "drop",
        startSeconds: d.seconds,
        changeDb: d.changeDb,
      })),
    });
    expect(s.bpm).toBe(135);
    expect(s.totalBeats).toBe(269);
    expect(s.drops.map((d) => d.bar)).toEqual([36, 76, 124, 156, 188, 236]);
    expect(s.offBar.map((d) => d.cutBeat)).toEqual([17.64, 57.68]);
    for (const bar of s.drops.map((d) => d.bar))
      expect(a.requiredCuts).toContain(bar);
  });
});

const derived = JSON.parse(
  readFileSync("tests/fixtures/teaser-run/derived.cut.json", "utf8"),
) as MixSpec;
const brief = JSON.parse(readFileSync(`${KIT}brief.json`, "utf8"));
type Seg = {
  shots?: { asset: string; shows?: string[]; box?: { on: string } }[];
};

describe("the rules, on the rule-derived dry-run cut", () => {
  it("names only capture-log labels in the storyboard", () => {
    for (const seg of brief.storyboard.segments as Seg[])
      for (const shot of seg.shots ?? [])
        for (const label of [...(shot.shows ?? []), shot.box?.on ?? []].flat())
          expect(
            footage[shot.asset].log.some((e) => e.label === label),
            `${shot.asset} ${label}`,
          ).toBe(true);
  });

  it("derives every studio shot's source, move, pointer and box with the helper", () => {
    type Shot = {
      asset: string;
      shows?: string[];
      box?: { on: string; words: string };
    };
    const studio = (brief.storyboard.segments as Seg[])
      .flatMap((s) => (s.shots ?? []) as Shot[])
      .filter((s) => s.asset.startsWith("ui-"));
    const shots = derived.shots.filter((s) => s.asset.startsWith("ui-"));
    expect(shots).toHaveLength(studio.length);
    shots.forEach((shot, i) => {
      const plan = studio[i];
      if (!plan.shows) return; // the owner's ComfyUI recording: given moves
      const want = sliceFor(
        footage,
        shot.asset,
        plan.shows[0],
        plan.shows[1],
        135,
      );
      expect(shot.sourceSeconds, shot.label).toBe(want.sourceSeconds);
      expect(shot.move, shot.label).toEqual(
        moveFor(footage, shot.asset, plan.box?.on ?? plan.shows[1]),
      );
      const at = (id: string) =>
        derived.layers.find((l) => l.id === `${id}-${shot.startBeat}`);
      const cursor = cursorFor(
        footage,
        shot.asset,
        shot.sourceSeconds,
        shot.beats,
        135,
      );
      if (cursor)
        expect(at("cursor")?.parameters, shot.label).toEqual({
          ...cursor,
          view: viewParameter(derived, shot, shot.startBeat),
        });
      const box = at("focus");
      expect(Boolean(box), shot.label).toBe(Boolean(plan.box));
      if (box)
        expect(box.parameters).toEqual({
          ...focusFor(
            footage,
            shot.asset,
            plan.box!.on,
            plan.box!.words,
            box.beats,
            135,
          ),
          view: viewParameter(derived, shot, box.startBeat),
        });
    });
  });

  it("keeps the worked examples identical to the derived cut", () => {
    const files = readdirSync(`${KIT}examples`).filter((f) => /^\d\d-/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(4);
    const covered = new Set<string>();
    for (const file of files) {
      const ex = JSON.parse(readFileSync(`${KIT}examples/${file}`, "utf8"));
      for (const key of ["example", "inputs", "decisions", "commands"])
        expect(ex[key], `${file} ${key}`).toBeDefined();
      for (const l of ex.cut.layers) {
        expect(l, file).toEqual(derived.layers.find((x) => x.id === l.id));
        covered.add(l.module);
      }
      for (const s of ex.cut.shots)
        expect(derived.shots, file).toContainEqual(s);
    }
    expect([...covered].sort()).toEqual(
      [...new Set(derived.layers.map((l) => l.module))].sort(),
    );
  });

  it("holds no v1 value in the kit a run reads", () => {
    const kit = readdirSync(KIT, { recursive: true })
      .map(String)
      .filter((f) => /\.(json|md|txt)$/.test(f));
    expect(kit).not.toContain("reference/v1.cut.json");
    for (const f of kit) {
      const text = readFileSync(`${KIT}${f}`, "utf8");
      // v1's hand-picked camera move onto the model families.
      expect(text, f).not.toMatch(/"x": 0\.3,\s*"y": 0\.8,\s*"zoom": 2\.3/);
    }
  });

  it("keeps the skill within the size rule and pointing at the kit", () => {
    const skill = readFileSync(
      "plugins/genobi/skills/genobi-teaser-run/SKILL.md",
      "utf8",
    );
    expect(skill.split("\n").length).toBeLessThanOrEqual(500);
    for (const file of [
      "brief.json",
      "track-analysis.json",
      "decision-table.md",
      "claims.md",
      "memory.example.json",
      "verify-teaser-run.mjs",
      "teaser-run-helper.mjs",
      "tests/fixtures/",
    ])
      expect(skill, file).toContain(file);
    for (const prompt of ["run-a.txt", "run-b.txt"]) {
      const text = readFileSync(`${KIT}prompts/${prompt}`, "utf8");
      expect(text).toContain(
        "plugins/genobi/skills/genobi-teaser-run/SKILL.md",
      );
      expect(text).toContain("tests/fixtures/");
      expect(text).toContain("GENOBI_AGENT_SESSION=1");
    }
  });
});

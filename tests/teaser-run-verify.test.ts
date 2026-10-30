import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MixSpec } from "../shared/templates/mix";
import {
  checkCut,
  readableWindow,
  type Finding,
} from "../scripts/lib/teaser-run/check";
import { checkClaims } from "../scripts/lib/teaser-run/claims";
import { checkMemory } from "../scripts/lib/teaser-run/memory";
import { v2Media } from "../scripts/lib/teaser-run/legacy";
import { compare } from "../scripts/lib/teaser-run/similarity";
import {
  loadAnalysis,
  REFERENCES,
  repoDeps,
  verify,
} from "../scripts/lib/teaser-run/verify";

// The teaser run verifier (scripts/verify-teaser-run.mjs): every rule it
// enforces, on the rule-derived cut and on copies of it broken one way at a time.
const v2 = (): MixSpec =>
  JSON.parse(readFileSync(REFERENCES.v2, "utf8")) as MixSpec;
const DERIVED = "tests/fixtures/teaser-run/derived.cut.json";
const rawDerived = (): MixSpec =>
  JSON.parse(readFileSync(DERIVED, "utf8")) as MixSpec;
const derived = rawDerived;
// Most tests break the rule-derived cut one way at a time.
const v1 = derived;
// The v2-derived fixtures are runs: checked on v2's media, as the kit renders them.
const deps = repoDeps(v2Media);
const analysis = loadAnalysis();
const run = (cut: unknown, allowNewWording = false) =>
  checkCut(cut, deps, { analysis, allowNewWording });
const fails = (findings: Finding[]) =>
  findings.filter((f) => f.level === "fail");
const codes = (findings: Finding[]) => fails(findings).map((f) => f.code);
const layer = (cut: MixSpec, id: string) =>
  cut.layers.find((l) => l.id === id)!;

describe("the teaser run verifier", () => {
  it("passes the rule-derived cut and the v2 cut on main, and checks the archived v1 cut", () => {
    expect(fails(run(derived()))).toEqual([]);
    const current = JSON.parse(readFileSync(REFERENCES.current, "utf8"));
    // The bundled cut (v3 since #244) is checked on today's template media
    // and breaks no rule.
    expect(
      fails(
        checkCut(current, repoDeps(), { analysis, allowNewWording: false }),
      ),
    ).toEqual([]);
    // v1 is checked on its archived media, with today's recipe defaults.
    // v1 predates the typed-label measure: only its short boxes fail it.
    const archived = JSON.parse(readFileSync(REFERENCES.v1, "utf8"));
    expect(new Set(codes(run(archived)))).toEqual(new Set(["readable-hold"]));
  });

  it("counts a second Director layer for each shot with a camera move", () => {
    // mixProject builds a moved shot as two layers: the push-in, then the hold.
    const cut = derived();
    const moved = cut.shots.filter((s) => s.move).length;
    expect(moved).toBeGreaterThan(20);
    for (let i = 0; i < 2; i++)
      cut.layers.push({
        ...layer(cut, "glitch-260"),
        id: `glitch-extra-${i}`,
        lane: `extra-${i}`,
      });
    // 45 shots + 22 moves + 61 overlays + the track = 129.
    expect(codes(run(cut))).toContain("layer-cap");
  });

  it("measures readable words from fully typed to faded or covered", () => {
    const current = JSON.parse(
      readFileSync(REFERENCES.current, "utf8"),
    ) as MixSpec;
    const at = (id: string) => current.layers.findIndex((l) => l.id === id);
    // focus-66 types its label by 0.45 s (draw 0.1) and is covered by the
    // reveal card from beat 70, 1.778 s in.
    const w = readableWindow(current, at("focus-66"));
    expect(w.from).toBeCloseTo(0.45, 6);
    expect(w.to).toBeCloseTo(1.778, 3);
    expect(w.coveredBy).toBe("reveal-2");
    // Started a beat earlier, the reveal leaves 0.88 s: a finding names it.
    const early = structuredClone(current);
    early.layers[at("reveal-2")].startBeat = 69;
    early.layers[at("reveal-2")].beats = 3;
    const found = fails(run(early)).find((f) => f.where === "focus-66");
    expect(found?.message).toMatch(/covered by reveal-2/);
    // A slow draw delays the typing: 1.778 - (0.6 x 0.5 + 0.4) = 1.08 s.
    const slow = structuredClone(current);
    slow.layers[at("focus-66")].parameters.draw = 0.6;
    expect(fails(run(slow)).some((f) => f.where === "focus-66")).toBe(true);
  });

  it("refuses a field of the wrong type before anything reads it", () => {
    const cut = v1() as unknown as Record<string, unknown>;
    cut.bpm = "135";
    expect(codes(run(cut))).toEqual(["shape"]);
    const shot = v1();
    delete (shot.shots[0] as { cropY?: unknown }).cropY;
    expect(codes(run(shot))).toEqual(["shape"]);
  });

  it("explains the Director's mix rules with a fix", () => {
    const cut = v1();
    cut.shots[4].startBeat += 1;
    const [finding] = fails(run(cut)).filter((f) => f.code === "mix");
    expect(finding.message).toMatch(/gap or overlaps/);
    expect(finding.fix).toMatch(/previous shot's startBeat \+ beats/);
    const past = v1();
    past.shots[0].sourceSeconds = 19;
    expect(fails(run(past)).find((f) => f.code === "mix")!.fix).toMatch(
      /sourceSeconds/,
    );
  });

  it("holds the layer cap and the renderer's length", () => {
    const cut = v1();
    for (let i = 0; i < 20; i++)
      cut.layers.push({
        ...layer(cut, "glitch-260"),
        id: `glitch-extra-${i}`,
        lane: `extra-${i}`,
      });
    expect(codes(run(cut))).toContain("layer-cap");
    const long = v1();
    long.beats = 272;
    long.layers.find((l) => l.id === "end-card")!.beats = 12;
    expect(codes(run(long))).toContain("duration");
  });

  it("validates recipe parameters and stills against the registry", () => {
    const cut = v1();
    layer(cut, "focus-43").parameters.dim = "2";
    layer(cut, "reveal-1").parameters.still =
      "/media/director-templates/genobi-teaser/still-missing.jpg";
    const found = fails(run(cut));
    expect(found.find((f) => f.where === "focus-43")?.code).toBe("parameters");
    expect(found.find((f) => f.where === "reveal-1")?.code).toBe(
      "asset-missing",
    );
    const kind = v1();
    layer(kind, "glitch-20").kind = "graphics";
    expect(fails(run(kind)).find((f) => f.where === "glitch-20")?.code).toBe(
      "kind",
    );
    expect(compare(kind, v1()).differences).toContain(
      "layer glitch-20: filter on glitch → graphics on glitch",
    );
    const unknown = v1();
    layer(unknown, "hud-1").module = "not-a-recipe";
    expect(codes(run(unknown))).toContain("recipe");
  });

  it("puts cuts on the analysed grid and on every required beat", () => {
    const tempo = v1();
    tempo.bpm = 134;
    expect(codes(run(tempo))).toContain("tempo");
    const merged = v1();
    // Join the shots either side of the drop on 92: nothing cuts there.
    const i = merged.shots.findIndex((s) => s.startBeat === 92);
    merged.shots[i - 1].beats += merged.shots[i].beats;
    merged.shots.splice(i, 1);
    const missing = fails(run(merged)).filter((f) => f.code === "missing-cut");
    expect(missing.map((f) => f.where)).toEqual(["beat 92"]);
  });

  it("starts slams on even beats and keeps layers in lane order", () => {
    const slam = v1();
    layer(slam, "make").startBeat = 33;
    expect(codes(run(slam))).toContain("slam-off-bar");
    const order = v1();
    const glitch = order.layers.pop()!;
    order.layers.unshift(glitch);
    expect(codes(run(order))).toContain("layer-order");
  });

  it("holds interface shots and words for 1.3 s, slams exempt", () => {
    const short = v1();
    const gallery = short.shots.findIndex((s) => s.asset === "ui-gallery");
    short.shots[gallery].beats = 2;
    short.shots[gallery + 1].startBeat -= 6;
    short.shots[gallery + 1].beats += 6;
    expect(
      fails(run(short)).some(
        (f) => f.code === "readable-hold" && f.where.startsWith("shot"),
      ),
    ).toBe(true);
    const fade = v1();
    layer(fade, "focus-66").parameters.fadeAt = 0.9;
    expect(fails(run(fade)).map((f) => f.where)).toContain("focus-66");
    // MAKE is two beats (0.89 s) by design.
    expect(fails(run(v1())).some((f) => f.where === "make")).toBe(false);
  });
  it("refuses unapproved or forbidden wording, with the owner's reason", () => {
    const cut = v1();
    layer(cut, "hud-1").parameters.text =
      `GENOBI // MADE WITH ${atob("TUFHTklGSUM=")}`;
    layer(cut, "focus-66").parameters.label = "A NEW TRUE LABEL";
    const found = fails(run(cut)).filter((f) => f.code === "claim");
    expect(found.map((f) => f.message).join(" ")).toMatch(/tool rule/);
    expect(found.map((f) => f.message).join(" ")).toMatch(/provenance rule/);
    expect(found.find((f) => f.where === "focus-66")!.fix).toMatch(
      /allow-new-wording/,
    );
    // The owner's yes turns a clean new string into a warning only.
    const allowed = run(cut, true).filter((f) => f.code === "claim");
    expect(allowed.find((f) => f.where === "focus-66")!.level).toBe("warn");
    expect(
      allowed
        .filter((f) => f.where === "hud-1")
        .every((f) => f.level === "fail"),
    ).toBe(true);
  });

  it("names each forbidden kind of claim", () => {
    const words = [
      ["Generated on open weights", "open-claim"],
      ["Clip by Kling", "provider"],
      ["Draft ready · 20 s", "invented-result"],
      ["The fastest studio", "superlative"],
    ];
    for (const [text, rule] of words) {
      const cut = { layers: [{ ...layer(v1(), "focus-66") }] };
      cut.layers[0] = {
        ...cut.layers[0],
        parameters: { ...cut.layers[0].parameters, label: text },
      };
      const found = checkClaims(cut, [])
        .map((f) => f.message)
        .join(" ");
      expect(found, text).toContain(`${rule} rule`);
    }
  });
});

describe("the run's memory", () => {
  const example = () =>
    JSON.parse(
      readFileSync(
        "docs/genobi-teaser-run/examples/memory.example.json",
        "utf8",
      ),
    );

  it("accepts the example, one decision per section", () => {
    expect(checkMemory(example())).toEqual([]);
  });

  it("names what is missing", () => {
    const m = example();
    m.schema = "other";
    delete m.runner.model;
    m.decisions[0].section = "middle";
    m.decisions[1].source = "guess";
    const found = checkMemory(m);
    const where = found.map((f) => f.where);
    expect(where).toContain("schema");
    expect(where).toContain("runner.model");
    expect(found.filter((f) => f.where === "decisions[0]")).toHaveLength(1);
    expect(found.some((f) => f.where === "decisions[1]")).toBe(true);
    // The section that lost its decision is a warning.
    expect(
      found.some((f) => f.level === "warn" && /open/.test(f.message)),
    ).toBe(true);
  });
});

describe("the similarity report", () => {
  it("scores the v1 cut 1 against itself, lower once it changes", () => {
    expect(compare(v1(), v1()).score).toBe(1);
    const changed = v1();
    changed.shots[0].sourceSeconds = 1;
    layer(changed, "focus-43").parameters.dim = 0.5;
    changed.layers = changed.layers.filter((l) => l.id !== "glitch-244");
    const s = compare(changed, v1());
    expect(s.score).toBeLessThan(1);
    expect(s.differences).toContain(
      "shot at beat 20: 20+4 character@0 zoom 1.33 → 20+4 character@1 zoom 1.33",
    );
    expect(s.differences).toContain("layer focus-43.dim: 0.45 → 0.5");
    expect(s.differences).toContain("layer glitch-244 (slice-glitch): missing");
    expect(s.overlayCounts["slice-glitch"]).toEqual({ run: 10, reference: 11 });
  });

  it("counts framing as part of a shot", () => {
    const reframed = v1();
    const square = reframed.shots.find((s) => s.cropY !== null)!;
    square.cropY = 0;
    const wide = reframed.shots.find((s) => s.zoom !== undefined)!;
    wide.zoom = 2;
    const s = compare(reframed, v1());
    expect(s.score).toBeLessThan(1);
    expect(s.differences.join("\n")).toMatch(/cropY 0/);
    expect(s.differences.join("\n")).toMatch(/zoom 2\b/);
    const moved = v1() as unknown as { shots: Record<string, unknown>[] };
    moved.shots[3].move = { x: 0.5, y: 0.5, zoom: 2 };
    expect(
      compare(moved as unknown as MixSpec, v1()).parts.exactShots,
    ).toBeLessThan(1);
  });
});

describe("copies and malformed input", () => {
  const write = (value: unknown) => {
    const dir = mkdtempSync(path.join(tmpdir(), "teaser-run-"));
    writeFileSync(
      path.join(dir, "cut.json"),
      typeof value === "string" ? value : JSON.stringify(value),
    );
    return dir;
  };

  it("fails a copy of v1 or the bundled cut, renamed and reordered too", () => {
    const copy = v2();
    copy.layers.reverse();
    for (const l of copy.layers) l.name = "renamed";
    const result = verify(write(copy));
    expect(result.exitCode).toBe(1);
    expect(result.findings.map((f) => f.code)).toContain("copied-reference");
    const bundled = JSON.parse(readFileSync(REFERENCES.current, "utf8"));
    expect(
      verify(write(bundled)).findings.some(
        (f) => f.code === "copied-reference",
      ),
    ).toBe(true);
    // A derived cut is not a copy.
    expect(
      verify(write(derived())).findings.some(
        (f) => f.code === "copied-reference",
      ),
    ).toBe(false);
  });

  it("reports a file that is not JSON instead of crashing", () => {
    const result = verify(write("{ not json"));
    expect(result.exitCode).toBe(1);
    expect(result.findings[0]).toMatchObject({
      code: "shape",
      where: "cut.json",
    });
  });

  it("never throws on a null or a wrong type anywhere in a cut", () => {
    const bad = [null, "x", 5, true, [], {}];
    const paths: (string | number)[][] = [
      ...Object.keys(v1()).map((k) => [k]),
      ...Object.keys(v1().shots[0]).map((k) => ["shots", 0, k]),
      ...Object.keys(v1().layers[0]).map((k) => ["layers", 0, k]),
      ...Object.keys(v1().layers[1].parameters).map((k) => [
        "layers",
        1,
        "parameters",
        k,
      ]),
      ["track", "asset"],
      ["track", "seconds"],
      ["shots", 0],
      ["layers", 0],
    ];
    for (const p of paths)
      for (const value of bad) {
        const cut = derived() as unknown as Record<string, unknown>;
        let at: Record<string | number, unknown> = cut;
        for (const key of p.slice(0, -1))
          at = at[key] as Record<string | number, unknown>;
        at[p.at(-1)!] = value;
        let findings: Finding[] = [];
        expect(
          () => (findings = run(cut)),
          `${p.join(".")} = ${JSON.stringify(value)}`,
        ).not.toThrow();
        // Whatever it is, the answer is a list of findings with fixes.
        for (const f of findings) expect(typeof f.fix).toBe("string");
      }
    expect(codes(run(null))).toEqual(["shape"]);
    const nullParameters = derived() as unknown as {
      layers: Record<string, unknown>[];
    };
    nullParameters.layers[0].parameters = null;
    expect(codes(run(nullParameters))).toEqual(["shape"]);
  });

  it("never throws on a null or a wrong type anywhere in a memory file", () => {
    const example = () =>
      JSON.parse(
        readFileSync(
          "docs/genobi-teaser-run/examples/memory.example.json",
          "utf8",
        ),
      );
    const bad = [null, "x", 5, [], {}];
    const keys = Object.keys(example());
    for (const key of keys)
      for (const value of bad) {
        const m = example();
        m[key] = value;
        expect(() => checkMemory(m), `${key}`).not.toThrow();
      }
    for (const list of ["decisions", "checkpoints", "corrections"])
      for (const value of bad) {
        const m = example();
        m[list][0] = value;
        expect(() => checkMemory(m), list).not.toThrow();
      }
    const m = example();
    m.decisions[0] = null;
    expect(
      checkMemory(m).find((f) => f.where === "decisions[0]")?.message,
    ).toMatch(/must be an object/);
    for (const value of [null, [], "x"])
      expect(checkMemory(value).length).toBeGreaterThan(0);
  });
});

describe("verify, on a run folder", () => {
  const folder = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "teaser-run-"));
    writeFileSync(path.join(dir, "cut.json"), JSON.stringify(derived()));
    return dir;
  };

  it("passes with warnings for the missing memory and render", () => {
    const result = verify(folder(), { reference: "v2" });
    expect(result.exitCode).toBe(0);
    expect(result.text).toMatch(/RESULT: PASS \(3 warnings\)/);
    expect(result.text).toMatch(/Similarity to v2: 0\.773/);
    expect(result.text).toMatch(/cut.json sha256 [0-9a-f]{64}/);
  });

  it("fails under --require-render and under --min-similarity", () => {
    const dir = folder();
    mkdirSync(path.join(dir, "render"));
    writeFileSync(
      path.join(dir, "memory.json"),
      readFileSync("docs/genobi-teaser-run/examples/memory.example.json"),
    );
    expect(verify(dir, { requireRender: true }).exitCode).toBe(1);
    const b = folder();
    const cut = derived();
    cut.shots[0].sourceSeconds = 1;
    writeFileSync(path.join(b, "cut.json"), JSON.stringify(cut));
    const result = verify(b, {
      reference: dir,
      minSimilarity: 0.999,
    });
    expect(result.exitCode).toBe(1);
    expect(result.findings.some((f) => f.code === "similarity")).toBe(true);
  });

  it("runs as a command: 0 on v1, 1 on a broken cut, 64 on bad usage", () => {
    const cli = (...args: string[]) =>
      spawnSync("node", ["scripts/verify-teaser-run.mjs", ...args], {
        encoding: "utf8",
      });
    const passing = folder();
    expect(cli(passing).status).toBe(0);
    const broken = derived();
    broken.bpm = 120;
    const dir = folder();
    writeFileSync(path.join(dir, "cut.json"), JSON.stringify(broken));
    const out = cli(dir, "--json");
    expect(out.status).toBe(1);
    expect(JSON.parse(out.stdout).pass).toBe(false);
    expect(cli().status).toBe(64);
    expect(cli(dir, "--min-similarity", "2").status).toBe(64);
    expect(cli(dir, "--min-similarity", "0.95").status).toBe(64);
    expect(
      execFileSync("node", ["scripts/teaser-run-helper.mjs", "seconds", "92"], {
        encoding: "utf8",
      }),
    ).toMatch(/"seconds": 40.889/);
  });
});

describe("run cuts are checked against today's media", () => {
  it("fails a cut that slices ui-agent past its 8.042 s take", () => {
    const cut = JSON.parse(readFileSync(REFERENCES.current, "utf8")) as MixSpec;
    expect(fails(checkCut(cut, repoDeps(), { analysis }))).toEqual([]);
    const shot = cut.shots.find((s) => s.asset === "ui-agent")!;
    shot.sourceSeconds = 8.25 - (shot.beats * 60) / cut.bpm;
    const live = checkCut(cut, repoDeps(), {
      analysis,
      allowNewWording: false,
    });
    expect(
      fails(live).some((f) => /runs past its source/.test(f.message)),
    ).toBe(true);
    // v2's 8.292 s take would have let it through: runs check on v2 media.
    expect(
      fails(checkCut(cut, repoDeps(v2Media), { analysis })).some((f) =>
        /runs past its source/.test(f.message),
      ),
    ).toBe(false);
  });
});

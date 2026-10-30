import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generationBody } from "../mcp/inputs";
import { tools } from "../mcp/tools";
import { validateInput } from "../server/validation";
import { readLayout } from "../shared/image-layout";
import { readyEntry } from "../shared/registry";
import { houseTemplates } from "../shared/templates/catalogue";
import { runKind } from "../shared/templates/run-kind";
import { parseCommand } from "../shared/director/commands";

// The plugin's skills are step lists of exact tool calls. A step that names a
// tool the MCP server does not have, or sends arguments its schema refuses,
// would fail an agent halfway through a paid run, so both are checked here.
const root = "plugins/genobi/skills";
const skills = readdirSync(root).map((name) => ({
  name,
  text: readFileSync(`${root}/${name}/SKILL.md`, "utf8"),
}));
const names = new Set(tools.map((t) => t.name));
// A mechanical template runs in the gallery and needs no skill; every agent
// template is run by its skill.
const agentTemplates = houseTemplates.filter((t) => runKind(t) === "agent");
const templateSkills = skills.filter((s) =>
  agentTemplates.some((t) => t.id === s.name),
);

/** Every `genobi_x {...}` call written as one inline code span. */
const calls = (text: string) =>
  [...text.matchAll(/`(genobi_[a-z_]+) (\{.*?\})`/g)].map((m) => ({
    tool: m[1],
    args: m[2],
  }));

/** A sample for each `<placeholder>` the skills ask the agent to fill. */
function sample(token: string, unquoted: boolean) {
  if (unquoted)
    return /revision/.test(token)
      ? "3"
      : /bpm/.test(token)
        ? "120"
        : /estimateUsd/.test(token)
          ? "1.42"
          : /cameras/.test(token)
            ? '{"hero": {"shot-sizes": "close-up"}}'
            : /beatsPerBar/.test(token)
              ? "4"
              : /beatOffsetSeconds/.test(token)
                ? "0.25"
                : /frame|bar/i.test(token)
                  ? "60"
                  : "{}";
  const samples: [RegExp, string][] = [
    [/quoteId/, "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b"],
    [/copyId/, "product-video.k7qm2xrpab"],
    [/^code$/, "K7QM-2XRP"],
    [/id$/, "job-1"],
    [/^aspect$/, "16:9"],
    [/model id/, "deepseek/deepseek-v4.1-flash"],
    [/^hermes,/, "hermes"],
    [/^local or/, "nous"],
    [/step 1/, "2026-10-21T10:00:00.000Z"],
    [/^preset$/, "cathedral"],
    [/^level$/, "mid"],
    [/^shotId$/, "hero"],
    [/yyyy/, "202610211200"],
  ];
  return samples.find(([re]) => re.test(token))?.[1] ?? "sample";
}
const fill = (args: string) =>
  args.replace(/<([^<>]+)>/g, (_, token: string, at: number) =>
    sample(token, /[:[,] $/.test(args.slice(0, at)) || args[at - 1] === "["),
  );

describe("plugin skills", () => {
  it("has one skill per agent template, plus the open route", () => {
    expect(templateSkills.map((s) => s.name).sort()).toEqual(
      agentTemplates.map((t) => t.id).sort(),
    );
    expect(agentTemplates.length).toBe(houseTemplates.length - 1);
    expect(skills.map((s) => s.name)).toContain("genobi-hermes");
  });

  it("gives every skill frontmatter Hermes accepts: its own name and a description", () => {
    for (const { name, text } of skills) {
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
      expect(front, name).toMatch(new RegExp(`^name: ${name}$`, "m"));
      const description = /^description: (.+)$/m.exec(front)?.[1] ?? "";
      expect(description.length, name).toBeGreaterThan(0);
      expect(description.length, name).toBeLessThanOrEqual(1024);
      // A colon and a space would end the YAML value early.
      expect(description, name).not.toMatch(/: /);
    }
  });

  it("names only tools the MCP server has", () => {
    for (const { name, text } of skills)
      for (const [tool] of text.matchAll(/genobi_[a-z_]+/g))
        expect(names, `${name} names ${tool}`).toContain(tool);
  });

  it("quotes, asks, submits and records provenance in every template skill", () => {
    for (const { name, text } of templateSkills) {
      const used = calls(text).map((c) => c.tool);
      for (const tool of [
        "genobi_status",
        "genobi_link_project",
        "genobi_template_plan",
        "genobi_budget",
        "genobi_quote",
        "genobi_submit",
        "genobi_job",
        "genobi_take",
        "genobi_take_to_project",
        "genobi_provenance",
      ])
        expect(used, `${name} calls ${tool}`).toContain(tool);
      expect(text).toContain(`"template": "${name}"`);
      expect(text).toContain(`plugins/genobi/skills/${name}/SKILL.md`);
      const template = houseTemplates.find((t) => t.id === name)!;
      // Takes reach the person's project through the handoff, then the
      // plate; the anime teaser instead cuts its takes in on beat frames
      // with an in-point (docs/anime-teaser-template.md, step 8).
      if (name === "anime-teaser")
        expect(text, name).toMatch(
          /"op": "add-clip", "layerId": "teaser-open", .*"sourceStartFrame"/,
        );
      else
        expect(text, name).toContain(
          '"op": "replace-plate", "layerId": "shot-<shotId>", "assetId": "<assetId>"',
        );
      expect(text, name).not.toMatch(/Replace source/);
      // The whole recipe is checked against the budget, once, before any
      // quote: every shot, plus every run a reference Genobi can make takes
      // (the anime teaser's sheet, storyboard and four track candidates),
      // since the demo key's three runs a session cannot be spent piecemeal
      // and fail at the shots.
      const recipe =
        template.shots.length +
        (name === "anime-teaser"
          ? template.references.reduce(
              (n, r) => n + (r.madeWith ? (r.candidates ?? 1) : 0),
              0,
            )
          : 0);
      const budgets = calls(text).filter((c) => c.tool === "genobi_budget");
      expect(text.indexOf("`genobi_budget"), name).toBeLessThan(
        text.indexOf("`genobi_quote"),
      );
      expect(budgets[0]?.args, name).toMatch(
        new RegExp(`^\\{"runs": ${recipe},`),
      );
      if (name === "anime-teaser") expect(recipe).toBe(8);
      // Image bytes never go inline in a tool call: requests with images
      // go through the CLI from a file.
      for (const call of calls(text))
        expect(call.args, `${name}: ${call.tool}`).not.toContain(
          "imageReferences",
        );
      // The cameras the project holds reach the plan, so quotes use them;
      // a template whose shots take no camera control has none to pass.
      const plan = calls(text).find((c) => c.tool === "genobi_template_plan");
      const cameras = template.shots.some((s) => {
        const controls = readyEntry(s.entry)?.controls;
        return controls?.kind === "video" && controls.camera;
      });
      if (cameras) {
        expect(plan?.args, name).toMatch(/"cameras": <cameras from step \d+>/);
        expect(text, name).toMatch(
          /`cameras`:\s+each\s+shot's `camera`, keyed by its `shotId`/,
        );
      } else expect(plan?.args, name).not.toContain('"cameras"');
      // The person's yes comes before the first submit.
      const ask = text.search(/Wait for a yes/);
      expect(ask, name).toBeGreaterThan(0);
      expect(ask, name).toBeLessThan(text.indexOf("`genobi_submit"));
    }
  });

  it("writes arguments the tools accept once the placeholders are filled", () => {
    let checked = 0;
    for (const { name, text } of skills)
      for (const { tool, args } of calls(text)) {
        let value: unknown;
        try {
          value = JSON.parse(fill(args));
        } catch {
          continue; // Spreads an earlier answer (`...shots[i].quote`).
        }
        const shape = tools.find((t) => t.name === tool)!.inputSchema;
        const parsed = z.strictObject(shape).safeParse(value);
        expect(parsed.success, `${name}: ${tool} ${args}`).toBe(true);
        checked++;
      }
    expect(checked).toBeGreaterThan(20);
  });

  it("writes Director commands the studio's parser accepts", () => {
    let checked = 0;
    for (const { name, text } of skills)
      for (const { tool, args } of calls(text)) {
        if (tool !== "genobi_director_command") continue;
        let value: { command: unknown };
        try {
          value = JSON.parse(fill(args));
        } catch {
          continue;
        }
        expect(
          () => parseCommand(value.command),
          `${name}: ${args}`,
        ).not.toThrow();
        checked++;
      }
    expect(checked).toBeGreaterThan(10);
  });

  it("writes quotes the studio's own validator accepts", () => {
    // The MCP schema is looser than the server: it leaves model-specific
    // bounds (resolution, duration range, treatments) to validateInput, so a
    // quote example is checked the way the studio will check it.
    let checked = 0;
    const refused: string[] = [];
    for (const { name, text } of skills)
      for (const { tool, args } of calls(text)) {
        if (tool !== "genobi_quote") continue;
        let value: Record<string, unknown>;
        try {
          value = JSON.parse(fill(args));
        } catch {
          continue;
        }
        try {
          validateInput(generationBody(value));
        } catch (error) {
          refused.push(`${name}: ${args} -> ${(error as Error).message}`);
        }
        checked++;
      }
    expect(refused).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("submits exactly what a quote step quoted, named by its step number", () => {
    let checked = 0;
    for (const { name, text } of skills)
      for (const match of text.matchAll(/`genobi_submit (\{.*?\})`/g)) {
        const reference = /\.\.\.the exact arguments of step (\d+)\}$/.exec(
          match[1],
        );
        expect(reference, `${name}: ${match[1]}`).not.toBeNull();
        // The nearest list item with that number before the submit.
        const before = text.slice(0, match.index);
        const items = [
          ...before.matchAll(new RegExp(`^\\s*${reference![1]}\\. `, "gm")),
        ];
        expect(items.length, `${name}: step ${reference![1]}`).toBeGreaterThan(
          0,
        );
        const start = items.at(-1)!.index!;
        const item = text.slice(start).split(/\n\s*\d+\. /)[0];
        expect(item, `${name}: step ${reference![1]} quotes`).toContain(
          "`genobi_quote {",
        );
        checked++;
      }
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  it("draws Klein boxes the studio accepts", () => {
    const hermes = skills.find((s) => s.name === "genobi-hermes")!.text;
    const klein = calls(hermes).find(
      (c) => c.tool === "genobi_quote" && c.args.includes("flux-3-klein"),
    )!;
    const args = JSON.parse(klein.args);
    const layout = readLayout(args.description);
    expect(layout.rows?.map((r) => r.id)).toEqual(["product", "plinth"]);
  });
});

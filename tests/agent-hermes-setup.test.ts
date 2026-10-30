// What `npm run agent:hermes-profile` prints: commands that reach the same
// `genobi` profile it set up, at Hermes' default root or another one.
import { describe, expect, it } from "vitest";
import { setupInstructions, shellQuote } from "../server/agent-hermes-setup";

describe("the setup's follow-up commands", () => {
  it("uses plain `hermes -p genobi` at Hermes' default root", () => {
    const text = setupInstructions({
      root: "/home/someone/.hermes",
      home: "/home/someone",
      model: "deepseek/deepseek-v4-pro",
      provider: "nous",
    });
    expect(text).toContain("  hermes -p genobi auth add nous --type oauth\n");
    expect(text).toContain("      hermes -p genobi\n");
    expect(text).toContain(
      "      GENOBI_AGENT_RUNNER=hermes GENOBI_AGENT_HERMES_MODEL=deepseek/deepseek-v4-pro GENOBI_AGENT_HERMES_PROVIDER=nous npm run dev\n",
    );
    expect(text).not.toContain("HERMES_HOME");
    expect(text).not.toContain("GENOBI_AGENT_HERMES_ROOT");
    expect(text).toMatch(/open route.*Anthropic and OpenAI/);
    expect(text).toMatch(/fallback off/);
  });

  it("points every command at another root, which Hermes reads from HERMES_HOME", () => {
    const text = setupInstructions({
      root: "/opt/hermes root",
      home: "/home/someone",
      model: "deepseek/deepseek-v4-pro",
      provider: "deepseek",
    });
    expect(text).toContain(
      "  HERMES_HOME='/opt/hermes root' hermes -p genobi auth add deepseek\n",
    );
    expect(text).toContain(
      "      HERMES_HOME='/opt/hermes root' hermes -p genobi\n",
    );
    expect(text).toContain(
      "      GENOBI_AGENT_HERMES_ROOT='/opt/hermes root' GENOBI_AGENT_RUNNER=hermes GENOBI_AGENT_HERMES_MODEL=deepseek/deepseek-v4-pro GENOBI_AGENT_HERMES_PROVIDER=deepseek npm run dev\n",
    );
    // Every `hermes -p genobi` carries the root; none falls back to ~/.hermes.
    for (const line of text.split("\n").filter((l) => l.includes("hermes -p")))
      expect(line).toContain("HERMES_HOME='/opt/hermes root' hermes -p genobi");
  });

  it("names an off-PATH Hermes in every command, and keeps the override for the studio", () => {
    const executable = "/Applications/My Tools/hermes";
    const text = setupInstructions({
      root: "/home/someone/.hermes",
      home: "/home/someone",
      model: "deepseek/deepseek-v4-pro",
      provider: "nous",
      executable,
      hermesVariable: executable,
    });
    expect(text).toContain(
      "  '/Applications/My Tools/hermes' -p genobi auth add nous --type oauth\n",
    );
    expect(text).toContain("      '/Applications/My Tools/hermes' -p genobi\n");
    expect(text).toContain(
      "      GENOBI_AGENT_HERMES='/Applications/My Tools/hermes' GENOBI_AGENT_RUNNER=hermes",
    );
    // No command falls back to a bare `hermes`.
    expect(text).not.toMatch(/(^|\s)hermes -p/m);
  });

  it("keeps a bare `hermes` when it is on PATH, with or without another root", () => {
    for (const root of ["/home/someone/.hermes", "/opt/hermes"]) {
      const text = setupInstructions({
        root,
        home: "/home/someone",
        model: "deepseek/deepseek-v4-flash",
        provider: "nous",
      });
      expect(text).toMatch(
        /(^|\s)hermes -p genobi auth add nous --type oauth\n/,
      );
      expect(text).not.toContain("GENOBI_AGENT_HERMES=");
    }
  });

  it("quotes for the shell", () => {
    expect(shellQuote("/plain/path")).toBe("/plain/path");
    expect(shellQuote("it's here")).toBe(`'it'\\''s here'`);
  });
});

// The deck's visualiser screen is a still black box: hover, press and focus
// never tint it (lime in the default theme, coral in cyberpunk) or move it
// (the old pointer tilt, the shell's pressed-button nudge). Only the
// characters react.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync("src/deck/deck.css", "utf8");
const shell = readFileSync("src/studio/shell.css", "utf8");

/** Every rule whose selector names `.deck-art`, as [selector, body]. */
const screenRules = () =>
  [...css.matchAll(/([^{}]*\.deck-art[^{}]*)\{([^}]*)\}/g)].map((m) => [
    m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    m[2],
  ]);

it("keeps the screen's background black in every state", () => {
  const rules = screenRules();
  expect(rules.length).toBeGreaterThan(0);
  for (const [, body] of rules) {
    const background = body.match(/background(?:-color)?:\s*([^;]+);/);
    if (background)
      expect(background[1].trim()).toBe(
        "var(--status-bg, rgba(14, 16, 18, 0.92))",
      );
  }
  expect(css).not.toMatch(/\.deck-art:hover\s*\{/);
  const still = rules.find(([selector]) => /:active/.test(selector));
  expect(still?.[0]).toMatch(/:hover/);
  expect(still?.[0]).toMatch(/:focus-visible/);
  expect(still?.[1]).toMatch(/background:\s*var\(--status-bg/);
});

it("never moves the screen, and outranks the shell's pressed nudge", () => {
  expect(css).not.toMatch(/--deck-tilt|perspective\(|rotateX|rotateY/);
  const [selector, body] = screenRules().find(([s]) => /:active/.test(s)) ?? [];
  for (const property of ["transform", "translate", "scale", "rotate"])
    expect(body).toMatch(new RegExp(`(^|[\\s;])${property}:\\s*none;`));
  // The shell nudges pressed buttons with `translate`; the still rule must
  // beat `.genobi-shell button:active:not(:disabled)` (0,3,1) on specificity.
  expect(shell).toMatch(/\.genobi-shell button:active:not\(:disabled\)/);
  // .genobi-deck .deck-vis button.deck-art:is(:active) is (0,4,1).
  expect(selector?.replace(/\s+/g, " ")).toContain(
    ".genobi-deck .deck-vis button.deck-art:is(",
  );
});

it("keeps a visible keyboard focus outline", () => {
  expect(css).toMatch(
    /button\.deck-art:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
  );
});

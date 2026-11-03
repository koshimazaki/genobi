import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { SETUP_LOCAL_ONLY } from "../src/setup/handoff";

/**
 * Since #57 the Genobi bubble is a guide: a session's progress and paid
 * steps are in the footer deck (the Genobi log). User-facing copy that sent
 * the person to "the bubble" for a session would point at nothing.
 */
it("setup and pairing copy points to the Genobi log, not the bubble", () => {
  expect(SETUP_LOCAL_ONLY).toContain("Genobi log");
  expect(SETUP_LOCAL_ONLY).not.toContain("bubble");
  for (const file of [
    "src/components/RunnerPairing.tsx",
    "src/setup/SetupAgent.tsx",
    "src/agent/SpawnAgentDialog.tsx",
    "src/director/useAgentSend.ts",
    "src/director/regenerate.ts",
    "src/template-gallery/TemplateGallery.tsx",
  ]) {
    const strings = readFileSync(file, "utf8").match(/"[^"\n]*"|`[^`]*`/g);
    for (const text of strings ?? [])
      expect(text, `${file}: ${text}`).not.toMatch(/\bbubble\b/i);
  }
});

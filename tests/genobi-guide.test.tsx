import { afterEach, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentSession } from "../shared/agent-session";
import { GenobiGuide } from "../src/agent/GenobiGuide";
import { GuideSessionStatus } from "../src/agent/GuideSessionStatus";
import { guidePointers } from "../src/agent/guide-content";
import { closeAgentSession } from "../src/agent/useAgentSession";

afterEach(() => closeAgentSession());

const session = (over: Partial<AgentSession> = {}): AgentSession => ({
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "a ninja falling through a cathedral",
  startedAt: "2026-11-02T10:00:00.000Z",
  lines: ["Linking the World scene"],
  exchange: [
    { from: "person", text: "a ninja falling through a cathedral", at: "a" },
    { from: "agent", text: "Take captured; it is in the Gallery", at: "b" },
  ],
  ...over,
});

it("teaches voice first in every mode, with no agent runtime controls", () => {
  for (const preset of ["camera", "director", "editor", "world", undefined])
    expect(guidePointers(preset)[0].text).toMatch(/mic/);
  const html = renderToStaticMarkup(<GenobiGuide defaultOpen />);
  expect(html).toContain("Press the mic and say what you want");
  expect(html).not.toMatch(/Start Genobi|Approve|Stop session|Brief/);
});

it("a voice session shows as a compact status: working, its reply, Speak to agent", () => {
  const html = renderToStaticMarkup(
    <GuideSessionStatus session={session()} onDeck={() => {}} />,
  );
  expect(html).toContain("Agent working");
  expect(html).toContain("Take captured; it is in the Gallery");
  expect(html).toContain("Results appear in Camera, the Gallery or World");
  expect(html).toContain("Speak to agent");
  expect(html).toContain("Open log");
  const done = renderToStaticMarkup(
    <GuideSessionStatus
      session={session({ status: "done" })}
      onDeck={() => {}}
    />,
  );
  expect(done).toContain("Session finished");
  expect(done).not.toContain("Speak to agent");
});

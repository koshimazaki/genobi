// The summary's agent section: "Set up Hermes" instead of a script and a
// restart, and Check again's answer shown with "checked just now".
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SetupAgentView, signInText } from "../src/setup/SetupAgent";
import { agentReadiness } from "../src/setup/handoff";
import type { SetupDraft } from "../src/setup/state";
import type { HarnessSignIn } from "../shared/agent-runner-setting";

const draft: SetupDraft = { selection: { agent: "hermes" } };
const MISSING =
  "Hermes' `genobi` profile is not set up yet. Choose Set up Hermes: Genobi sets it up for the model and provider chosen in setup.";
const row = (signedIn: HarnessSignIn["signedIn"]): HarnessSignIn[] => [
  { runner: "hermes", name: "Hermes", installed: true, signedIn },
];
const view = (
  props: Partial<Parameters<typeof SetupAgentView>[0]> & {
    rows?: HarnessSignIn[];
  },
) =>
  renderToStaticMarkup(
    <SetupAgentView
      draft={draft}
      installVoice={false}
      readiness={{ ready: true, runner: "hermes" }}
      start={{ phase: "idle", message: "" }}
      message=""
      onSignIn={() => {}}
      onCheck={() => {}}
      {...props}
    />,
  );

it("offers Set up Hermes for a missing profile, never a script or a restart", () => {
  const readiness = agentReadiness(
    draft,
    {
      available: false,
      runner: "hermes",
      message: MISSING,
      setup: "hermes-profile",
    },
    row(false),
  );
  expect(readiness).toMatchObject({ ready: false, setup: "hermes-profile" });
  const html = view({ readiness, rows: row(false) });
  expect(html).toContain(">Set up Hermes</button>");
  expect(html).toContain(">Check again</button>");
  expect(html).not.toContain("Sign in to Hermes");
  expect(html).not.toMatch(/npm run|agent:hermes-profile|restart/);
  const running = view({
    readiness,
    rows: row(false),
    profile: { phase: "running", steps: { check: "done", apply: "running" } },
  });
  expect(running).toContain("Setting up Hermes…");
  expect(running).toContain('aria-label="Hermes setup progress"');
  const failed = view({
    readiness,
    profile: {
      phase: "failed",
      steps: { check: "done", create: "failed" },
      error: "hermes profile create failed.",
    },
  });
  expect(failed).toContain('<p role="alert">hermes profile create failed.</p>');
});

it("shows the harness's answer after Check again, checked just now", () => {
  const signedOut = agentReadiness(
    draft,
    { available: true, runner: "hermes" },
    row(false),
  );
  expect(view({ readiness: signedOut, rows: row(false) })).toContain(
    "Hermes: not signed in",
  );
  const after = view({ rows: row(true), checked: true });
  expect(after).toContain(
    "Hermes: signed in<small> · checked just now</small>",
  );
  expect(view({ rows: row("unknown") })).toContain(
    "Hermes: sign-in state unknown",
  );
  expect(view({ rows: row(true) })).not.toContain("checked just now");
  expect(signInText(undefined)).toBe("sign-in state unknown");
});

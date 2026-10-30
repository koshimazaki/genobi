import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConnectView, prefilledHermes } from "../src/setup/SetupConnect";
import { parseAgentRunnerChoice } from "../server/agent-runner-setting";
import {
  CONNECT_STEP,
  questions,
  SUMMARY_STEP,
} from "../src/setup/SetupChoices";
import type { KeysStatus } from "../shared/keys";
import {
  HERMES_CHOICES,
  hermesChoiceOf,
  type HarnessSignIn,
} from "../shared/agent-runner-setting";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Rendering must not call the server");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const keys: KeysStatus = {
  keychain: true,
  comfy: { connected: true, source: "keychain", revision: 1 },
  bfl: { connected: false, revision: 0 },
};
const rows: HarnessSignIn[] = [
  { runner: "claude", name: "Claude Code", installed: true, signedIn: true },
  { runner: "hermes", name: "Hermes", installed: true, signedIn: "unknown" },
  { runner: "codex", name: "Codex", installed: false, signedIn: false },
];
const view = (props: Partial<Parameters<typeof ConnectView>[0]> = {}) =>
  renderToStaticMarkup(
    <ConnectView
      keys={keys}
      onKeys={() => {}}
      rows={rows}
      installed={{ claude: true, hermes: true }}
      local
      environment={false}
      busy={false}
      hermes={{ model: "", provider: "" }}
      providerHeld={false}
      onHermes={() => {}}
      onSignIn={() => {}}
      onCheck={() => {}}
      message=""
      onContinue={() => {}}
      {...props}
    />,
  );

it("sits between the choices and the summary", () => {
  expect(questions[CONNECT_STEP]).toBe("Connect your keys and agent.");
  expect(SUMMARY_STEP).toBe(CONNECT_STEP + 1);
});

it("shows the Comfy and optional BFL key fields, and never a key", () => {
  const html = view();
  for (const id of ["key-comfy", "key-bfl"])
    expect(html).toContain(`id="${id}"`);
  expect(html).toContain("BFL API key (optional)");
  expect(html).not.toContain("key-runware");
  expect(html).toContain("Connected · saved in your Keychain");
  expect(html).not.toMatch(/value="[^"]+"[^>]*name="apiKey"/);
  expect(fetch).not.toHaveBeenCalled();
});

it("shows each harness installed and signed in, with its own Sign in", () => {
  const html = view({ chosen: "claude" });
  expect(html).toContain("Claude Code");
  expect(html).toContain("· your agent");
  expect(html).toContain("Signed in");
  expect(html).toContain("Sign-in state unknown");
  expect(html).toContain("Not found on this machine");
  expect(html.match(/>Sign in</g)).toHaveLength(3);
  expect(html).toContain("Check sign-in again");
});

it("asks Hermes for its open model and provider, and says Codex cannot run yet", () => {
  const hermes = view({ chosen: "hermes" });
  expect(hermes).toContain("Hermes model");
  expect(hermes).toContain("Hermes provider");
  expect(hermes).toContain("Choose Hermes’ open provider below to sign in.");
  const codex = view({ chosen: "codex", providerHeld: true });
  expect(codex).toContain("cannot run Codex sessions yet");
  expect(codex).not.toContain("Hermes provider");
});

/** The Hermes row's Sign in button, from the rendered list. */
const hermesSignIn = (html: string) =>
  html
    .match(
      /<li data-chosen="(?:true|false)">(?:(?!<\/li>).)*Hermes<\/strong>(?:(?!<\/li>).)*<\/li>/,
    )![0]
    .match(/<button[^>]*>Sign in/)![0];

it("asks for a provider wherever Hermes needs one, not only when chosen", () => {
  const needs = view({ chosen: "claude" });
  expect(needs).toContain("Hermes provider");
  expect(needs).toContain("Choose Hermes’ open provider below to sign in.");
  expect(hermesSignIn(needs)).toContain("disabled");
  // GENOBI_AGENT_HERMES_PROVIDER (or a saved one) on the server is enough.
  const held = view({ chosen: "claude", providerHeld: true });
  expect(held).not.toContain("Hermes provider");
  expect(held).not.toContain("open provider below");
  expect(hermesSignIn(held)).not.toContain("disabled");
  // A provider typed here enables it too, and the fields stay while typing.
  const typed = view({
    chosen: "claude",
    hermes: { model: "", provider: "nous" },
  });
  expect(typed).toContain("Hermes provider");
  expect(hermesSignIn(typed)).not.toContain("disabled");
});

it("offers Hermes' open models as a list, DeepSeek V4.1 Flash first and prefilled", () => {
  expect(HERMES_CHOICES[0]).toEqual({
    label: "DeepSeek V4.1 Flash",
    model: "deepseek/deepseek-v4.1-flash",
    provider: "nous",
    note: "MIT · Nous Portal",
  });
  // Every listed pair is one the server's open-route check accepts.
  for (const choice of HERMES_CHOICES)
    expect(
      parseAgentRunnerChoice({
        runner: "hermes",
        hermesModel: choice.model,
        hermesProvider: choice.provider,
      }),
    ).toMatchObject({ hermesModel: choice.model });
  // Nothing saved: the default pair; a saved pair is kept as it is.
  expect(prefilledHermes()).toEqual({
    model: "deepseek/deepseek-v4.1-flash",
    provider: "nous",
  });
  expect(prefilledHermes({ hermesModel: "x/y", hermesProvider: "z" })).toEqual({
    model: "x/y",
    provider: "z",
  });
  const html = view({ chosen: "hermes", hermes: prefilledHermes() });
  expect(html).toMatch(
    /<option value="deepseek\/deepseek-v4.1-flash" selected="">DeepSeek V4.1 Flash · MIT · Nous Portal<\/option>/,
  );
  expect(html).toContain('<option value="other">Other open model…</option>');
  // No name to type, and Sign in works from the prefilled pair.
  expect(html).not.toContain("Hermes provider");
  expect(html).not.toContain('<input value="deepseek');
  expect(hermesSignIn(html)).not.toContain("disabled");
  expect(hermesChoiceOf("deepseek/deepseek-v4.1-flash", "Nous")).toBe(
    HERMES_CHOICES[0],
  );
  expect(hermesChoiceOf("some/model", "nous")).toBeUndefined();
});

it("sets Hermes up before signing in when its profile is missing", () => {
  const missing = rows.map((row) =>
    row.runner === "hermes"
      ? { ...row, signedIn: false as const, profile: "missing" as const }
      : row,
  );
  const html = view({
    chosen: "hermes",
    rows: missing,
    hermes: prefilledHermes(),
    profile: {
      phase: "running",
      steps: { check: "done", create: "running" },
    },
  });
  expect(html).toContain(">Set up &amp; sign in<");
  expect(html).toContain('aria-label="Hermes setup progress"');
  expect(html).toContain('data-state="running"');
  expect(html).not.toMatch(/agent:hermes-profile|restart/);
});

it("says a Check sign-in again answered just now", () => {
  expect(view({ checked: true })).toContain("Checked just now.");
  expect(view()).not.toContain("Checked just now.");
});

it("says where keys go when this page has no local server", () => {
  const html = view({ keys: null, local: false, rows: undefined });
  expect(html).toContain("Keys are saved by the local studio");
  expect(html).not.toContain('id="key-comfy"');
  expect(html).toContain("Sign in from the local studio");
  expect(html).not.toContain("Check sign-in again");
});

it("names the environment when it picks the runner", () => {
  expect(view({ environment: true })).toContain(
    "GENOBI_AGENT_RUNNER is set on this server",
  );
});

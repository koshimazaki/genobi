// Send with no agent set up is not a dead end: the spawn chooser comes
// first, the project copy is saved only once an agent is ready, and the
// same instruction is sent without retyping. A save the copy refused
// closes the dialog and is reported in the popover instead. Also the Global
// prompt's own Send to Genobi and the header's Director/Editor switch.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import { REGENERATE_INSTRUCTION_MAX } from "../shared/director/regenerate";
import { base } from "./house-template-fixtures";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const SESSION: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Regenerate",
  startedAt: "2026-10-29T12:00:00.000Z",
  lines: [],
};

/** A local server with no agent saved until the chooser saves one. */
function noAgentYet(order: string[]) {
  let saved: { runner: string | null } = { runner: null };
  const prompts: string[] = [];
  const server = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/agent/status")
      return json(
        saved.runner
          ? { available: true, runner: saved.runner }
          : { available: false, message: "No agent is set up on this server." },
      );
    if (url === "/api/settings/agent-runner") {
      if (method === "POST") {
        saved = JSON.parse(String(init!.body));
        order.push("agent saved");
      }
      return json({ saved, environment: false, hermesProvider: true });
    }
    if (url === "/api/agent/sign-in")
      return json({
        harnesses: [
          {
            runner: "claude",
            name: "Claude Code",
            installed: true,
            signedIn: true,
          },
        ],
      });
    if (url === "/api/projects")
      return json({
        projects: [
          {
            id: "signal-studies",
            access: "owner",
            copyId: "signal-studies.abcdefghjk",
          },
        ],
      });
    if (url === "/api/agent/sessions" && method === "POST") {
      prompts.push(JSON.parse(String(init!.body)).prompt);
      order.push("started");
      return json(SESSION, 201);
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  });
  return { server, prompts };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

async function editor(save: () => Promise<boolean>, why?: () => never) {
  const { studioStore } = await import("../src/studio/store");
  studioStore.getState().actions.initialize(base());
  const guard = await import("../src/director/leave-guard");
  guard.flushBeforeLeaving(save, () => false, why);
  return {
    store: await import("../src/agent/spawn-store"),
    ...(await import("../src/director/regenerate")),
  };
}

describe("Send with no agent set up", () => {
  it("asks for an agent first, then saves, then sends the same words", async () => {
    const order: string[] = [];
    const { server, prompts } = noAgentYet(order);
    vi.stubGlobal("fetch", server);
    const { store, regenerate } = await editor(async () => {
      order.push("copy saved");
      return true;
    });
    const sending = regenerate("Use my new order");
    await vi.waitFor(() => expect(store.spawnStep().kind).toBe("choose"));
    // Nothing saved or sent while the person is choosing.
    expect(order).toEqual([]);
    store.choose({ runner: "claude" });
    expect(await sending).toMatchObject({ kind: "sent", turn: "new" });
    expect(order).toEqual(["agent saved", "copy saved", "started"]);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Use my new order");
  });

  it("reports a refused save in the popover, with the dialog closed", async () => {
    const order: string[] = [];
    const { server, prompts } = noAgentYet(order);
    vi.stubGlobal("fetch", server);
    const problem = { kind: "refused", message: "Invalid bundle" } as const;
    const { store, regenerate } = await editor(
      async () => false,
      (() => problem) as never,
    );
    const sending = regenerate("Use my new order");
    await vi.waitFor(() => expect(store.spawnStep().kind).toBe("choose"));
    store.choose({ runner: "claude" });
    expect(await sending).toEqual({ kind: "unsaved", problem });
    expect(store.spawnStep()).toEqual({ kind: "closed" });
    expect(prompts).toEqual([]);
  });

  it("says Send to Genobi, naming the runner only in the tooltip", async () => {
    const { sendLabel } = await import("../src/director/useAgentSend");
    expect(sendLabel({ available: true, runner: "claude" })).toEqual({
      button: "Send to Genobi",
      runner: "Claude Code",
    });
    const none = sendLabel({ available: false });
    expect(none.button).toBe("Send to Genobi");
    expect(none.runner).toBeUndefined();
    expect(none.hint).toMatch(/without retyping/);
    // Before the status is read: no claim either way.
    expect(sendLabel(undefined)).toEqual({ button: "Send to Genobi" });
  });
});

describe("the Global prompt's Send to Genobi", () => {
  it("sits under the field, in the agent actions' primary style", async () => {
    const { default: ProjectDirection } =
      await import("../src/director/ProjectDirection");
    const html = renderToStaticMarkup(
      <ProjectDirection
        project={base().project}
        selected=""
        disabled={false}
        command={() => ""}
      />,
    );
    expect(html).toMatch(
      /<\/label><div class="dir-global-send">.*<button type="button" class="dir-primary dir-agent-action"/,
    );
    expect(html).toContain(">Send to Genobi</button>");
  });

  it("sends the global prompt as the instruction, within its limit", async () => {
    const { promptsInstruction } =
      await import("../shared/director/prompt-send");
    const { projectFeedback } = await import("../shared/director/feedback");
    const project = base().project;
    const send = (globalPrompt: string) => {
      const p = { ...project, globalPrompt };
      return promptsInstruction(p, projectFeedback({ project: p, prompt: "" }))
        .text;
    };
    expect(send("  ")).toBe("");
    expect(send("Night, rain, slow dolly.")).toBe(
      "Follow the project's global prompt, now saved in the project:\nNight, rain, slow dolly.",
    );
    const long = send("word ".repeat(1000));
    expect(long.length).toBeLessThanOrEqual(REGENERATE_INSTRUCTION_MAX);
    expect(long).toMatch(/read the rest with genobi_project\)$/);
  });
});

describe("the header", () => {
  const props = {
    busy: false,
    transportBusy: false,
    open: () => {},
    save: () => {},
    render: () => {},
    switchMode: () => {},
  };
  it("styles Regenerate as the primary agent action", async () => {
    const { default: ComposerHeader } =
      await import("../src/director/ComposerHeader");
    const html = renderToStaticMarkup(<ComposerHeader {...props} />);
    expect(html).toMatch(
      /<div class="dir-regenerate"><button class="dir-primary dir-agent-action"/,
    );
  });

  it("goes to the Editor from the Director and back, in the same row", async () => {
    const { default: ComposerHeader } =
      await import("../src/director/ComposerHeader");
    const director = renderToStaticMarkup(<ComposerHeader {...props} simple />);
    const editorHtml = renderToStaticMarkup(<ComposerHeader {...props} />);
    const row = (html: string) =>
      /<div class="dir-file-actions">(.*)<\/div><\/section>/.exec(html)![1];
    expect(row(director)).toMatch(
      /<button class="dir-mode-switch">Go to Editor ↗<\/button>$/,
    );
    expect(row(editorHtml)).toMatch(
      /<button class="dir-mode-switch">Back to Director<\/button>$/,
    );
    // Secondary: the pink primary stays on Render MP4 and the agent actions.
    expect(row(director)).not.toContain("dir-primary");
    const without = renderToStaticMarkup(
      <ComposerHeader {...props} switchMode={undefined} />,
    );
    expect(without).not.toContain("dir-mode-switch");
  });

  it("keeps the row one height in both modes on a phone", async () => {
    const { readFile } = await import("node:fs/promises");
    const css = await readFile("src/director/regenerate.css", "utf8");
    // Three rows of two hold the Editor's five and the Director's three.
    expect(css).toMatch(
      /@media \(max-width: 760px\)[^@]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*grid-template-rows: repeat\(3, minmax\(36px, auto\)\);/,
    );
    expect(css).toMatch(/white-space: nowrap;/);
  });
});

// Box 1.8: a voice transcript goes to the running agent session as the
// person's next message; the prompt takes it only with no session running,
// or when the person chooses "To prompt". A Camera request still goes to
// Camera. Nothing is submitted or paid by voice.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import {
  deliverTranscript,
  liveSession,
  panelActions,
  sendToSession,
  type Destinations,
  type Routed,
} from "../src/voice/session-message";

beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

const RUNNING: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "running",
  prompt: "Cut the drop",
  startedAt: "2026-10-28T00:00:00.000Z",
  lines: [],
};

/** The studio's destinations, recorded. */
function studio(
  session: AgentSession | undefined,
  options: {
    request?: boolean;
    refuse?: string;
    promptOnScreen?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const to: Destinations = {
    intent: (words) => {
      if (!options.request) return undefined;
      calls.push(`camera ${words}`);
      return { kind: "intent", words, text: "Camera" };
    },
    live: () => session,
    send: async (s, words) => {
      calls.push(`session ${s.id} ${words}`);
      return options.refuse
        ? { ok: false, error: options.refuse }
        : { ok: true, pending: false };
    },
    prompt: (words): Routed => {
      if (options.promptOnScreen === false) return { kind: "none", words };
      calls.push(`prompt ${words}`);
      return {
        kind: "filled",
        words,
        field: "description",
        text: "In the Camera prompt.",
      };
    },
  };
  return { to, calls };
}

describe("where a transcript goes", () => {
  it("goes to the live session as the next message, not the prompt", async () => {
    const { to, calls } = studio(RUNNING);
    const routed = await deliverTranscript("Make the drop slower", to);
    expect(calls).toEqual([`session ${RUNNING.id} Make the drop slower`]);
    expect(routed).toMatchObject({ kind: "session", session: RUNNING.id });
    expect((routed as { text: string }).text).toMatch(
      /Hermes session as your next message/,
    );
  });

  it("goes to the prompt on screen when no session runs", async () => {
    const { to, calls } = studio(undefined);
    const routed = await deliverTranscript("a penguin on ice", to);
    expect(calls).toEqual(["prompt a penguin on ice"]);
    expect(routed.kind).toBe("filled");
  });

  it("'To prompt' overrides a running session", async () => {
    const { to, calls } = studio(RUNNING);
    const routed = await deliverTranscript("a penguin on ice", to, true);
    expect(calls).toEqual(["prompt a penguin on ice"]);
    expect(routed.kind).toBe("filled");
  });

  it("a Camera request still goes to Camera with a session running", async () => {
    const { to, calls } = studio(RUNNING, { request: true });
    const routed = await deliverTranscript(
      "an image with FLUX of a penguin",
      to,
    );
    expect(calls).toEqual(["camera an image with FLUX of a penguin"]);
    expect(routed.kind).toBe("intent");
  });

  it("a session that refuses leaves the words to the prompt, with its reason", async () => {
    const ended = studio(RUNNING, { refuse: "That session has ended." });
    const routed = await deliverTranscript("slower", ended.to);
    expect(ended.calls).toEqual([
      `session ${RUNNING.id} slower`,
      "prompt slower",
    ]);
    expect(routed).toMatchObject({ kind: "filled" });
    expect((routed as { text: string }).text).toMatch(
      /^The session did not take it: That session has ended\./,
    );
    const nowhere = studio(RUNNING, { refuse: "Gone.", promptOnScreen: false });
    const lost = await deliverTranscript("slower", nowhere.to);
    expect(lost).toMatchObject({ kind: "none" });
    expect((lost as { text: string }).text).toMatch(
      /Gone\. No prompt on this screen\./,
    );
  });

  it("an empty transcript goes nowhere", async () => {
    const { to, calls } = studio(RUNNING);
    expect(await deliverTranscript("", to)).toEqual({
      kind: "none",
      words: "",
    });
    expect(calls).toEqual([]);
  });
});

describe("the live session and the send", () => {
  it("only a starting or running session is live", () => {
    expect(liveSession(() => RUNNING)).toBe(RUNNING);
    expect(
      liveSession(() => ({ ...RUNNING, status: "starting" })),
    ).toBeDefined();
    for (const status of ["done", "failed", "stopped", "waiting"] as const)
      expect(liveSession(() => ({ ...RUNNING, status }))).toBeUndefined();
    expect(liveSession(() => undefined)).toBeUndefined();
  });

  it("sends as voice, opens the bubble, and reports a refusal without throwing", async () => {
    const opened = vi.fn();
    window.addEventListener("genobi:open-bubble", opened);
    const send = vi.fn().mockResolvedValue(RUNNING);
    expect(await sendToSession(RUNNING, "slower", send)).toEqual({
      ok: true,
      pending: false,
    });
    expect(send).toHaveBeenCalledWith(RUNNING.id, {
      prompt: "slower",
      source: "voice",
    });
    expect(opened).toHaveBeenCalledTimes(1);
    // A session relayed from the hosted studio has no message route here.
    const relayed = vi.fn();
    expect(
      await sendToSession(
        { ...RUNNING, localSessionUrl: "http://127.0.0.1:4317/" },
        "slower",
        relayed,
      ),
    ).toMatchObject({ ok: false });
    expect(relayed).not.toHaveBeenCalled();
    const refused = vi
      .fn()
      .mockRejectedValue(new Error("That session has ended."));
    expect(await sendToSession(RUNNING, "slower", refused)).toEqual({
      ok: false,
      error: "That session has ended.",
    });
  });

  it("says when a message waits for the agent's next Genobi step", async () => {
    const queued = vi.fn().mockResolvedValue({
      ...RUNNING,
      exchange: [{ from: "person", text: "slower", at: "", pending: true }],
    });
    expect(await sendToSession(RUNNING, "slower", queued)).toEqual({
      ok: true,
      pending: true,
    });
    const { to } = studio(RUNNING);
    to.send = async () => ({ ok: true, pending: true });
    const routed = await deliverTranscript("slower", to);
    expect((routed as { text: string }).text).toMatch(
      /It waits for the agent's next Genobi step\./,
    );
  });
});

describe("the panel's buttons", () => {
  const session: Routed = {
    kind: "session",
    words: "a",
    session: RUNNING.id,
    text: "",
  };
  const filled: Routed = { kind: "filled", words: "a", field: "x", text: "" };
  const none: Routed = { kind: "none", words: "a" };
  const held: Routed = { kind: "held", words: "a", text: "" };

  it("a session route offers To prompt, and Send correction once edited", () => {
    expect(panelActions(session, false, true)).toMatchObject({
      update: undefined,
      other: "To prompt",
    });
    expect(panelActions(session, true, true).update).toBe("Send correction");
  });

  it("a prompt route keeps Update prompt and Send to agent instead", () => {
    expect(panelActions(filled, true, true)).toMatchObject({
      update: "Update prompt",
      other: "Send to agent instead",
    });
  });

  it("nothing placed keeps Try again, and offers the running session or a new one", () => {
    expect(panelActions(none, true, false)).toMatchObject({
      update: "Try again",
      other: "Do it in a session",
    });
    expect(panelActions(none, false, true).other).toBe("Send to agent");
    expect(panelActions(held, false, true)).toMatchObject({
      placed: false,
      other: "Send to agent",
    });
  });
});

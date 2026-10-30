import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentSession } from "../shared/agent-session";
import {
  nextTeaching,
  teachingHold,
  teachingLine,
  TEACHINGS,
} from "../shared/teachings";
import { messageHold } from "../shared/install-messages";
import { presets } from "../src/studio/presets";
import { DECK_READY, deckNow } from "../src/deck/deck-now";
import { AgentBubble } from "../src/agent/AgentBubble";
import {
  resetTeaching,
  stepTeaching,
  teachingNow,
  TEACHINGS_KEY,
} from "../src/teachings/store";

afterEach(() => {
  resetTeaching();
  vi.unstubAllGlobals();
});

const idle = { connected: false };
const teaching = teachingLine(TEACHINGS[0]);
const ids = TEACHINGS.map((t) => t.id);

/** A small seeded source (mulberry32), so an order can be asserted. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ids `count` steps would show, starting from nothing seen. */
function run(random: () => number, count: number): string[] {
  let seen: string[] = [];
  const shown: string[] = [];
  for (let i = 0; i < count; i++) {
    const next = nextTeaching(seen, random);
    shown.push(next.teaching.id);
    seen = next.seen;
  }
  return shown;
}

describe("the teachings list", () => {
  it("names a real preset or the studio, with unique ids and short text", () => {
    const surfaces = new Set<string>([...presets.map((p) => p.id), "studio"]);
    for (const t of TEACHINGS) {
      expect(surfaces.has(t.surface), t.id).toBe(true);
      expect(t.text.trim().length, t.id).toBeGreaterThan(0);
      expect(t.text.length, t.id).toBeLessThan(120);
    }
    expect(new Set(TEACHINGS.map((t) => t.id)).size).toBe(TEACHINGS.length);
  });
  it("keeps the owner's lore line exactly, and has no Image/Edit teaching", () => {
    expect(TEACHINGS.map((t) => t.text)).toContain(
      "The scroll remembers what the sword forgets.",
    );
    expect(TEACHINGS.some((t) => /\b(image|edit) mode\b/i.test(t.text))).toBe(
      false,
    );
  });
  it("shows every teaching once before any repeats, cycle after cycle", () => {
    const shown = run(seeded(7), TEACHINGS.length * 3);
    for (let cycle = 0; cycle < 3; cycle++) {
      const slice = shown.slice(cycle * ids.length, (cycle + 1) * ids.length);
      expect(new Set(slice).size).toBe(ids.length);
      expect(new Set(slice)).toEqual(new Set(ids));
    }
  });
  it("shuffles: two random sources give two different orders", () => {
    const a = run(seeded(1), ids.length);
    const b = run(seeded(2), ids.length);
    expect(a).not.toEqual(b);
    expect(new Set(a)).toEqual(new Set(b));
  });
  it("never shows the just-seen teaching first in a fresh cycle", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const shown = run(seeded(seed), ids.length * 4);
      for (let i = 1; i < shown.length; i++)
        expect(shown[i], `seed ${seed} at ${i}`).not.toBe(shown[i - 1]);
    }
    // The worst case: a source that always picks the first candidate.
    const last = ids.at(-1)!;
    const order = [...ids.slice(0, -1), last];
    expect(nextTeaching(order, () => 0).teaching.id).not.toBe(last);
  });
  it("skips ids it has seen, and ignores ids no longer in the list", () => {
    const next = nextTeaching(["gone", ids[0]], () => 0);
    expect(next.teaching.id).toBe(ids[1]);
    expect(next.seen).toEqual([ids[0], ids[1]]);
    // A source at its very top edge still picks inside the pool.
    expect(ids).toContain(nextTeaching([], () => 0.9999999).teaching.id);
  });
  it("holds a teaching at the install wait's reading pace", () => {
    for (const t of TEACHINGS)
      expect(teachingHold(t.text)).toBe(messageHold(t.text));
  });
});

describe("the deck's bar", () => {
  it("reads the ready line without a teaching, and the teaching when idle", () => {
    expect(deckNow({ activity: [], linked: [], supervisor: idle })).toBe(
      DECK_READY,
    );
    expect(
      deckNow({ activity: [], linked: [], supervisor: idle, teaching }),
    ).toBe(teaching);
    // The bar's uppercase prefix, then the sentence in its own case, which
    // the pixel font reads better than caps at the bar's size.
    expect(teaching).toBe(`TEACHING · ${TEACHINGS[0].text}`);
  });
  it("prefers anything real over a teaching", () => {
    const session: AgentSession = {
      id: "11111111-1111-4111-8111-111111111111",
      runner: "hermes",
      status: "running",
      prompt: "Cut the teaser",
      startedAt: "2026-10-28T10:00:00.000Z",
      lines: ["update 1"],
    };
    const job = [{ id: "job", line: "GENERATING KLEIN IMAGE  73%" }];
    const base = { activity: [], linked: [], supervisor: idle, teaching };
    expect(deckNow({ ...base, session })).toBe("update 1");
    expect(deckNow({ ...base, activity: job })).toBe(job[0].line);
    expect(
      deckNow({
        ...base,
        session: { ...session, status: "done", summary: "Cut." },
      }),
    ).toBe("Cut.");
    expect(deckNow({ ...base, linked: [{ role: "builder" }] })).toBe(
      "LINKED · builder",
    );
    expect(
      deckNow({
        ...base,
        supervisor: { origin: "http://x", connected: false },
      }),
    ).toBe("SUPERVISOR DISCONNECTED");
  });
});

describe("the seen list in this browser", () => {
  it("still steps through a whole cycle when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const shown = [teachingNow().id];
    for (let i = 1; i < ids.length; i++) {
      stepTeaching();
      shown.push(teachingNow().id);
    }
    expect(new Set(shown)).toEqual(new Set(ids));
  });
  it("picks up where this browser left off and records what it shows", () => {
    const store = new Map([[TEACHINGS_KEY, JSON.stringify([ids[0]])]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    const first = teachingNow().id;
    expect(first).not.toBe(ids[0]);
    expect(JSON.parse(store.get(TEACHINGS_KEY)!)).toEqual([ids[0], first]);
  });
});

describe("the idle bubble", () => {
  it("shows one teaching, labelled Teachings, with Next", () => {
    const html = renderToStaticMarkup(<AgentBubble defaultOpen />);
    expect(html).toContain("Ready when you are");
    expect(html).toContain(">Teachings<");
    expect(html).toContain(teachingNow().text);
    expect(html).toContain('aria-label="Next teaching"');
  });
  it("gives a running session's space to the session, not a teaching", () => {
    const html = renderToStaticMarkup(
      <AgentBubble
        defaultOpen
        session={{
          id: "s",
          runner: "claude",
          status: "running",
          startedAt: "2026-10-28T10:00:00Z",
          prompt: "Go",
          lines: ["Working on it"],
        }}
      />,
    );
    expect(html).not.toContain(">Teachings<");
  });
});

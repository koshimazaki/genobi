import { afterEach, describe, expect, it } from "vitest";
import type { RunLocationState } from "../shared/comfy/run-location";
import { workflowCatalogue } from "../shared/comfy/workflows";
import { SettingRefused, SettingUnconfirmed } from "../src/run-settings";
import {
  appliedRevision,
  expectedHeaders,
  loadSettings,
  resetSettingsForTests,
  restoreWrites,
  settingSaver,
  settingsHold,
  useSettingsStore,
} from "../src/settings-store";

// Every reader and writer of a setting goes through its one lane, which
// orders answers by the server's settings revision. Three of them on the run
// location are started, handled by a fake server (a read samples the value
// and revision then; a write it takes changes both), and answered later, in
// any order and with any outcome. At every step, a control showing a value
// other than the one paid writes name holds Generate. Once everything has
// settled, the studio shows the server's final value and revision, names it
// in paid writes, and holds nothing.
type Location = "local" | "cloud";
type Kind = "save" | "recreate" | "bootstrap" | "reread";
/**
 * answered: handled and answered. refused: answered no; nothing changed.
 * lost: handled (a write is taken), but the answer never arrives.
 * unsent: never reached the server, and the studio cannot tell.
 */
type Outcome = "answered" | "refused" | "lost" | "unsent";
const KINDS: Kind[] = ["save", "recreate", "bootstrap", "reread"];
const OUTCOMES: Outcome[] = ["answered", "refused", "lost", "unsent"];

/** The fake server's setting: its value and the revision it is at. */
let server = { location: "cloud" as Location, revision: 100 };
const answerOf = (at: typeof server) =>
  ({
    revision: at.revision,
    location: at.location,
    choices: ["local", "cloud"],
    fixed: false,
  }) as RunLocationState;

function deferred() {
  let resolve!: (value: RunLocationState | null) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<RunLocationState | null>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** What each open control shows: its own choice, or the lane's answers. */
let views: { value?: RunLocationState | null }[] = [];
function control() {
  const view: (typeof views)[number] = {};
  views.push(view);
  return settingSaver("run-location", (next) => {
    if (next.value !== undefined) view.value = next.value;
  });
}

/** The lane's own reads, handled and answered one step after they start. */
let laneReads: ReturnType<typeof deferred>[] = [];

interface Steps {
  handle(): void;
  answer(): void;
}

/** Starts one reader or writer; returns its server and answer steps. */
function start(kind: Kind, value: Location, outcome: Outcome): Steps {
  const reply = deferred();
  const write = kind === "save" || kind === "recreate";
  if (kind === "save")
    // A control of its own: one opened, or opened again, for this save.
    void control().save(
      answerOf({ location: value, revision: 0 }),
      () => reply.promise,
    );
  else if (kind === "recreate")
    void restoreWrites.location(value, () => reply.promise).catch(() => {});
  else if (kind === "bootstrap")
    loadSettings({
      location: () => reply.promise,
      workflows: async () => workflowCatalogue(() => undefined, false, 1),
    });
  else void control().read(reply.promise);
  let seen = server;
  return {
    handle() {
      if (outcome === "refused" || outcome === "unsent") return;
      if (write) server = { location: value, revision: server.revision + 1 };
      seen = server;
    },
    answer() {
      if (outcome === "answered") reply.resolve(answerOf(seen));
      else if (outcome === "refused") reply.reject(new SettingRefused("No."));
      else if (kind === "reread")
        reply.resolve(null); // aborted
      else reply.reject(new SettingUnconfirmed("Lost."));
    },
  };
}

/** A small seeded generator, so a failing case can be run again. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(next: () => number, items: T[]) =>
  items[Math.floor(next() * items.length)];

/** A uniform interleaving of each writer's start, handling and answer. */
function interleave(next: () => number) {
  const left = [3, 3, 3];
  const order: number[] = [];
  while (order.length < 9) {
    let r = Math.floor(next() * (left[0] + left[1] + left[2]));
    let w = 0;
    while (r >= left[w]) r -= left[w++];
    left[w]--;
    order.push(w);
  }
  return order;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function reset() {
  server = { location: "cloud", revision: 100 };
  views = [];
  laneReads = [];
  resetSettingsForTests({
    // The lane's own read waits for the next step, like any other answer.
    "run-location": () => {
      const read = deferred();
      laneReads.push(read);
      return read.promise;
    },
    workflow: async () => workflowCatalogue(() => undefined, false, 1),
  });
  useSettingsStore.setState({
    location: undefined,
    workflows: {},
    restoring: false,
    held: {},
    saving: {},
  });
}
afterEach(reset);

/**
 * The invariant at every step: a control showing a value other than the one
 * paid writes name (its own choice, or a value not yet confirmed) holds
 * Generate and Approve.
 */
function unheldMismatch() {
  const applied = useSettingsStore.getState().location;
  if (settingsHold() !== null) return null;
  const shown = views.find(
    (view) => view.value && view.value.location !== applied,
  );
  return shown
    ? `shows ${shown.value!.location} with ${applied} applied and no hold`
    : null;
}

/** Answers the lane's own reads started so far: handled and answered now. */
async function answerLaneReads() {
  const reads = laneReads;
  laneReads = [];
  for (const read of reads) read.resolve(answerOf(server));
  await flush();
}

/** Runs one case: `order` names a writer per step (start, handled, answered). */
async function play(cast: Kind[], outcomes: Outcome[], order: number[]) {
  reset();
  const label = `${cast.join(",")} ${outcomes.join(",")} order ${order.join("")}`;
  const steps: (Steps | undefined)[] = [];
  const done = [0, 0, 0];
  for (const [n, w] of order.entries()) {
    const step = done[w]++;
    if (step === 0)
      // Writers alternate values, starting away from the server's.
      steps[w] = start(cast[w], w % 2 === 0 ? "local" : "cloud", outcomes[w]);
    else if (step === 1) steps[w]!.handle();
    else steps[w]!.answer();
    await flush();
    const before = unheldMismatch();
    if (before) return `${label}: step ${n}: ${before}`;
    await answerLaneReads();
    const after = unheldMismatch();
    if (after) return `${label}: after step ${n}'s lane read: ${after}`;
  }
  // A lane read can owe another only through a write; settle what is left.
  for (let n = 0; laneReads.length && n < 3; n++) await answerLaneReads();
  const shown = useSettingsStore.getState().location;
  const header = expectedHeaders()["Genobi-Run-Location"];
  const revision = appliedRevision("run-location");
  const hold = settingsHold();
  return shown === server.location &&
    revision === server.revision &&
    header === shown &&
    hold === null
    ? null
    : `${label}: server ${server.location}@${server.revision}, store ${shown}@${revision}, header ${header}, hold ${hold}`;
}

describe("three run-location readers and writers, handled and answered in any order", () => {
  it("settles on a read the server handled before a write but answered after it", async () => {
    // The case ordering by start got wrong: a first read settles, a save is
    // sent, then a read; the server handles the read (Cloud) before the save
    // (Local), and the read's answer lands last.
    const failure = await play(
      ["save", "reread", "reread"],
      ["answered", "answered", "answered"],
      [2, 2, 2, 0, 1, 1, 0, 0, 1],
    );
    expect(failure).toBeNull();
  });

  it("settles on the server's value and revision, named by paid writes, with no hold", async () => {
    // 54 casts x 64 outcomes x 1,680 interleavings is 5.8 million cases: a
    // seeded sample of them.
    const SAMPLE = 60_000;
    const next = random(61);
    const casts = KINDS.flatMap((a) =>
      KINDS.flatMap((b) => KINDS.map((c) => [a, b, c])),
    ).filter((cast) => cast.filter((k) => k === "bootstrap").length <= 1);
    const failures: string[] = [];
    for (let n = 0; n < SAMPLE; n++) {
      const cast = pick(next, casts);
      const outcomes = [0, 1, 2].map(() => pick(next, OUTCOMES));
      const failure = await play(cast, outcomes, interleave(next));
      if (failure) failures.push(failure);
    }
    expect(failures.slice(0, 10), `${failures.length} failing`).toEqual([]);
  }, 120_000);
});

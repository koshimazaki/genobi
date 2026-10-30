import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingLane } from "../src/setting-lane";
import {
  saveRunLocation,
  SettingRefused,
  SettingSaver,
  SettingUnconfirmed,
  UNCONFIRMED,
  UNKNOWN,
  type SettingView,
} from "../src/run-settings";

// A setting applies only the newest revision the server handled: a delayed
// answer the server handled earlier cannot overwrite a later one.
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

/** A setting's value as the server answers it: what, and at which revision. */
type V = { v: string; revision: number };
const at = (v: string, revision: number): V => ({ v, revision });

describe("a setting's lane", () => {
  const lane = () => new SettingLane<V>(async () => at("server", 0));
  it("applies by revision: an answer the server handled earlier never lands over a later one", async () => {
    const l = lane();
    const early = deferred<V>();
    const late = deferred<V>();
    const first = l.run("read", () => early.promise);
    const second = l.run("write", () => late.promise);
    // The read was handled at revision 4, the write made revision 5; the
    // write's answer arrives first.
    late.resolve(at("cloud", 5));
    expect(await second).toMatchObject({
      current: true,
      value: at("cloud", 5),
    });
    early.resolve(at("local", 4));
    expect(await first).toMatchObject({ current: false });
    expect(l.current).toEqual(at("cloud", 5));
  });

  it("applies an earlier-sent answer the server handled later", async () => {
    const l = lane();
    const read = deferred<V>();
    const reading = l.run("read", () => read.promise);
    await l.run("write", async () => at("cloud", 5));
    // The read reached the server after the write: revision 6, applied.
    read.resolve(at("local", 6));
    expect(await reading).toMatchObject({ current: true });
    expect(l.current).toEqual(at("local", 6));
  });

  it("holds while the newest write is in flight, and only it releases", async () => {
    const l = lane();
    const one = deferred<V>();
    const two = deferred<V>();
    const first = l.run("write", () => one.promise);
    const second = l.run("write", () => two.promise);
    one.resolve(at("local", 5));
    await first;
    expect(l.saving).not.toBe(0);
    two.resolve(at("cloud", 6));
    await second;
    expect(l.saving).toBe(0);
  });

  it("reads the server once when a request ends without a value", async () => {
    const reads: string[] = [];
    const applied: V[] = [];
    const l = new SettingLane<V>(
      async () => {
        reads.push("auto");
        return at("cloud", 3);
      },
      (value) => applied.push(value),
    );
    await l.run("write", () => Promise.reject(new SettingRefused("No.")));
    expect(reads).toEqual(["auto"]);
    expect(applied).toEqual([at("cloud", 3)]);
    // An automatic read that ends empty starts no other, and what was
    // applied is no longer confirmed.
    const quiet = new SettingLane<V>(async () => {
      reads.push("empty");
      return null;
    });
    await quiet.run("read", async () => at("local", 1));
    await quiet.run("read", async () => null);
    expect(reads).toEqual(["auto", "empty"]);
    expect(quiet.confirmed).toBe(false);
  });
});

describe("settings answers", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number, body: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status })),
    );
  const location = JSON.stringify({
    revision: 7,
    location: "cloud",
    choices: ["local", "cloud"],
    fixed: false,
  });

  it("tells a definite refusal from an uncertain one", async () => {
    answer(400, JSON.stringify({ error: "No." }));
    await expect(saveRunLocation("local")).rejects.toBeInstanceOf(
      SettingRefused,
    );
    answer(500, "{}");
    await expect(saveRunLocation("local")).rejects.toBeInstanceOf(
      SettingUnconfirmed,
    );
    answer(200, "{trunc");
    await expect(saveRunLocation("local")).rejects.toBeInstanceOf(
      SettingUnconfirmed,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      }),
    );
    await expect(saveRunLocation("local")).rejects.toBeInstanceOf(
      SettingUnconfirmed,
    );
    answer(200, location);
    expect(await saveRunLocation("cloud")).toMatchObject({
      location: "cloud",
      revision: 7,
    });
    // Without the revision it reflects, an answer cannot be ordered: nothing.
    answer(200, JSON.stringify({ ...JSON.parse(location), revision: "7" }));
    expect(await saveRunLocation("cloud")).toBeNull();
  });
});

type Shown = Partial<SettingView<V>>;
function saver() {
  const views: Shown[] = [];
  let view: SettingView<V> = {
    value: null,
    confirmed: true,
    saving: false,
    message: "",
  };
  /** What the lane's own read of the server answers next. */
  let reread: () => Promise<V | null> = async () => null;
  const s = new SettingSaver<V>(
    (next) => {
      view = { ...view, ...next };
      views.push(next);
    },
    new SettingLane<V>(() => reread()),
  );
  const rereadWith = (next: () => Promise<V | null>) => (reread = next);
  return { s, view: () => view, views, rereadWith };
}

describe("SettingSaver", () => {
  it("shows what the server holds after a save whose answer was lost", async () => {
    // Local to Cloud: the server saved Cloud, but the answer never arrived.
    const { s, view, rereadWith } = saver();
    await s.read(Promise.resolve(at("local", 1)));
    const reread = vi.fn(async () => at("cloud", 2));
    rereadWith(reread);
    await s.save(at("cloud", 0), () =>
      Promise.reject(new SettingUnconfirmed("lost")),
    );
    expect(reread).toHaveBeenCalledTimes(1);
    expect(view()).toEqual({
      value: at("cloud", 2),
      confirmed: true,
      saving: false,
      message: UNCONFIRMED,
    });
  });

  it("shows nothing as chosen when neither the save nor the re-read answers", async () => {
    const { s, view, rereadWith } = saver();
    await s.read(Promise.resolve(at("local", 1)));
    rereadWith(() => Promise.reject(new SettingUnconfirmed("down")));
    await s.save(at("cloud", 0), () =>
      Promise.reject(new SettingUnconfirmed("lost")),
    );
    expect(view()).toMatchObject({ confirmed: false, message: UNKNOWN });
  });

  it("drops the optimistic choice after a refusal and shows the server's value", async () => {
    const { s, view, rereadWith } = saver();
    await s.read(Promise.resolve(at("local", 1)));
    // The server is unchanged: its read answers the same revision.
    const reread = vi.fn(async () => at("local", 1));
    rereadWith(reread);
    await s.save(at("cloud", 0), () =>
      Promise.reject(new SettingRefused("Not allowed.")),
    );
    expect(reread).toHaveBeenCalledTimes(1);
    expect(view()).toMatchObject({
      value: at("local", 1),
      confirmed: true,
      message: "Not allowed.",
    });
  });

  it("ignores switching back while the first save is in flight, and shows the server's answer", async () => {
    // The picker: default to the no-LoRA template (slow), then back to default.
    const { s, view } = saver();
    await s.read(Promise.resolve(at("ltx-2-5-akuspace-t2v", 1)));
    const first = deferred<V>();
    const back = vi.fn(async () => at("ltx-2-5-akuspace-t2v", 3));
    const swapping = s.save(at("ltx-2-5-t2v", 0), () => first.promise);
    expect(view()).toMatchObject({
      value: at("ltx-2-5-t2v", 0),
      saving: true,
    });
    // The switch back while saving sends nothing.
    expect(await s.save(at("ltx-2-5-akuspace-t2v", 0), back)).toBe(false);
    expect(back).not.toHaveBeenCalled();
    first.resolve(at("ltx-2-5-t2v", 2));
    await swapping;
    expect(view()).toMatchObject({
      value: at("ltx-2-5-t2v", 2),
      saving: false,
    });
    // Once it has answered, switching back is sent and shown.
    expect(await s.save(at("ltx-2-5-akuspace-t2v", 0), back)).toBe(true);
    expect(view()).toMatchObject({ value: at("ltx-2-5-akuspace-t2v", 3) });
  });

  it("drops a first read the server handled before a save", async () => {
    const { s, view } = saver();
    const slowRead = deferred<V | null>();
    const reading = s.read(slowRead.promise);
    await s.save(at("cloud", 0), async () => at("cloud", 2));
    slowRead.resolve(at("local", 1));
    await reading;
    expect(view().value).toEqual(at("cloud", 2));
  });
});

describe("SettingSaver after an unconfirmed value", () => {
  it("never confirms an unverified value when a later save is refused", async () => {
    // Cloud confirmed; a change to Local fails and so does the re-read; then
    // a Cloud choice is refused. Local must not come back as confirmed.
    const { s, view, rereadWith } = saver();
    await s.read(Promise.resolve(at("cloud", 1)));
    rereadWith(() => Promise.reject(new SettingUnconfirmed("down")));
    await s.save(at("local", 0), () =>
      Promise.reject(new SettingUnconfirmed("lost")),
    );
    // What the lane last applied, not the choice sent, and unconfirmed.
    expect(view()).toMatchObject({ value: at("cloud", 1), confirmed: false });
    const reread = vi.fn(async () => at("cloud", 1));
    rereadWith(reread);
    await s.save(at("cloud", 0), () =>
      Promise.reject(new SettingRefused("Busy.")),
    );
    // Refused: the server is read before anything shows.
    expect(reread).toHaveBeenCalledTimes(1);
    expect(view()).toEqual({
      value: at("cloud", 1),
      confirmed: true,
      saving: false,
      message: "Busy.",
    });
  });

  it("stays unconfirmed when that re-read fails too", async () => {
    const { s, view, rereadWith } = saver();
    await s.read(Promise.resolve(at("cloud", 1)));
    const fail = () => Promise.reject(new SettingUnconfirmed("down"));
    rereadWith(fail);
    await s.save(at("local", 0), fail);
    await s.save(at("cloud", 0), () =>
      Promise.reject(new SettingRefused("Busy.")),
    );
    expect(view()).toMatchObject({ confirmed: false, message: UNKNOWN });
  });
});

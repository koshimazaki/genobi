import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../server/errors";
import { partKey } from "../shared/upscale-parts";

// A split upscale through the real job service (`./upscale-parts-harness`).
import { fixture, partsSetup, sent } from "./upscale-parts-harness";

describe("a split upscale", () => {
  it("quotes the set as the sum of its parts and sends nothing", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    expect(set.parts.map((p) => p.frames)).toEqual([456, 99]);
    expect(set.status).toBe("quoted");
    const quotes = set.parts.map((p) =>
      app.store.data.quotes.find(
        (q) => q.id === app.store.data.partSets[0].parts[p.index].quoteId,
      )!,
    );
    expect(set.estimateUsd).toBeGreaterThan(0);
    expect(set.estimateUsd).toBeCloseTo(
      quotes[0].estimateUsd + quotes[1].estimateUsd,
      9,
    );
    expect(sent(app)).toBe(0);
  });

  it("refuses a clip that fits one upscale", async () => {
    const app = await partsSetup();
    app.store.data.sources[0].duration = 12;
    await expect(
      app.parts.plan(app.request, app.session),
    ).rejects.toMatchObject({ code: "upscale_fits" });
  });

  it("sends each part once, reserved before its submission, on one confirm", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    const submit = app.bfl.submit.bind(app.bfl);
    const reserved: boolean[] = [];
    vi.spyOn(app.bfl, "submit").mockImplementation(async (...args) => {
      // The part's job is stored, on disk, before the provider hears of it.
      const index = app.bfl.submissions;
      const key = partKey(set.id, index, 0);
      const disk = JSON.parse(
        await readFile(path.join(app.store.directory, "jobs.json"), "utf8"),
      );
      reserved.push(
        disk.jobs.some(
          (job: { idempotencyKey: string; status: string }) =>
            job.idempotencyKey === key && job.status === "submitting",
        ),
      );
      return submit(...args);
    });
    const { set: confirmed } = await app.parts.confirm(
      set.id,
      app.session,
      set.quoteId,
    );
    expect(sent(app)).toBe(2);
    expect(reserved).toEqual([true, true]);
    expect(confirmed.status).toBe("running");
    expect(confirmed.parts.every((p) => p.job?.status === "Pending")).toBe(
      true,
    );
    // A second confirmation, or a read, sends nothing more.
    await app.parts.confirm(set.id, app.session, set.quoteId);
    await app.parts.read(set.id, app.session);
    expect(sent(app)).toBe(2);
    await expect(
      app.parts.confirm(set.id, app.session, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: "quote_mismatch" });
  });

  it("sends each part once when two confirmations land together", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    await Promise.all([
      app.parts.confirm(set.id, app.session, set.quoteId),
      app.parts.confirm(set.id, app.session, set.quoteId),
    ]);
    expect(sent(app)).toBe(2);
    expect(app.store.data.jobs).toHaveLength(2);
  });

  it("refuses the set once the run location or template no longer fits its quote", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    vi.spyOn(app.service.settings, "fits").mockReturnValue(false);
    await expect(
      app.parts.confirm(set.id, app.session, set.quoteId),
    ).rejects.toMatchObject({ code: "quote_expired" });
    expect(sent(app)).toBe(0);
    expect(app.store.data.partSets[0].confirmation).toBeUndefined();
  });

  it("never confirms a lapsed quote, and quotes the set again on a read", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    for (const quote of app.store.data.quotes)
      quote.expiresAt = new Date(Date.now() - 1000).toISOString();
    await expect(
      app.parts.confirm(set.id, app.session, set.quoteId),
    ).rejects.toMatchObject({ code: "quote_expired" });
    expect(sent(app)).toBe(0);
    const { set: fresh } = await app.parts.read(set.id, app.session);
    expect(fresh.quoteId).not.toBe(set.quoteId);
    await expect(
      app.parts.confirm(set.id, app.session, set.quoteId),
    ).rejects.toMatchObject({ code: "quote_mismatch" });
    await app.parts.confirm(set.id, app.session, fresh.quoteId);
    expect(sent(app)).toBe(2);
  });

  it("marks an uncertain part, never resends it, and retries it only on a new confirm", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    const submit = app.bfl.submit.bind(app.bfl);
    vi.spyOn(app.bfl, "submit").mockImplementation(async (...args) => {
      if (app.bfl.submissions === 1) {
        app.bfl.submissions++;
        throw new AppError(502, "Submission uncertain.", "submission_unknown");
      }
      return submit(...args);
    });
    const { set: after } = await app.parts.confirm(
      set.id,
      app.session,
      set.quoteId,
    );
    expect(sent(app)).toBe(2);
    expect(after.status).toBe("failed");
    expect(after.parts[1].job?.status).toBe("Error");
    expect(after.parts[1].uncertain).toBe(true);
    expect(after.parts[0].uncertain).toBeUndefined();
    // Confirming the set again, and reading it, never resends the part.
    await app.parts.confirm(set.id, app.session, set.quoteId);
    await app.parts.read(set.id, app.session);
    expect(sent(app)).toBe(2);
    // Only a part that failed can be retried, and only with its own new quote.
    await expect(app.parts.retry(set.id, 0, app.session)).rejects.toMatchObject(
      { code: "part_not_failed" },
    );
    const { set: quoted } = await app.parts.retry(set.id, 1, app.session);
    const retry = quoted.parts[1].retryQuote!;
    expect(retry.id).toBeTruthy();
    expect(sent(app)).toBe(2);
    await expect(
      app.parts.confirmRetry(set.id, 1, app.session, set.quoteId),
    ).rejects.toMatchObject({ code: "quote_mismatch" });
    expect(sent(app)).toBe(2);
    const { set: retried } = await app.parts.confirmRetry(
      set.id,
      1,
      app.session,
      retry.id,
    );
    expect(sent(app)).toBe(3);
    expect(retried.parts[1].job?.status).toBe("Pending");
    expect(app.store.data.jobs.map((job) => job.idempotencyKey)).toContain(
      partKey(set.id, 1, 1),
    );
    // The spent retry quote cannot send the part a second time.
    await expect(
      app.parts.confirmRetry(set.id, 1, app.session, retry.id),
    ).rejects.toBeInstanceOf(AppError);
    expect(sent(app)).toBe(3);
  });

  it("joins in order with the original once every part is ready", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    await app.parts.confirm(set.id, app.session, set.quoteId);
    app.bfl.ready = true;
    app.bfl.media = new Uint8Array(await readFile(fixture));
    for (const job of app.store.data.jobs) job.lastPolledAt = 0;
    const { set: done } = await app.parts.read(set.id, app.session);
    expect(done.parts.every((p) => p.job?.status === "Ready")).toBe(true);
    expect(done.status).toBe("joined");
    expect(done.joined?.id).toBe("joined");
    const jobs = done.parts.map((p) => p.job!.id);
    expect(app.joins).toEqual([[...jobs, "mix-source"]]);
    // Joined once: a later read does not join again.
    await app.parts.read(set.id, app.session);
    expect(app.joins).toHaveLength(1);
    expect(sent(app)).toBe(2);
  });

  it("holds the set to the demo budget as a whole", async () => {
    const app = await partsSetup();
    vi.spyOn(app.service, "budget").mockReturnValue({
      sessionLimit: 3,
      budgetUsd: 5,
      runsLeft: 1,
      usdLeft: 5,
      reservedUsd: 0,
      countsLocalRuns: false,
    });
    await expect(
      app.parts.plan(app.request, app.session),
    ).rejects.toMatchObject({ code: "budget" });
    expect(app.store.data.partSets ?? []).toHaveLength(0);
    // The cuts and any quote taken for them are taken back.
    expect(app.store.data.sources.map((s) => s.id)).toEqual(["mix-source"]);
    expect(app.store.data.quotes).toHaveLength(0);
  });

  it("reopens a set only for the same request; a changed prompt plans anew", async () => {
    const app = await partsSetup();
    const prompt = { ...app.request, upscalePrompt: "fine film grain" };
    const { set } = await app.parts.plan(prompt, app.session);
    const { set: again } = await app.parts.plan(prompt, app.session);
    expect(again.id).toBe(set.id);
    const { set: other } = await app.parts.plan(
      { ...prompt, upscalePrompt: "sharper edges" },
      app.session,
    );
    expect(other.id).not.toBe(set.id);
    // Confirming the new set sends the new prompt, never the replaced one.
    await app.parts.confirm(other.id, app.session, other.quoteId);
    expect(app.bfl.requests.map((r) => r.body.prompt)).toEqual([
      expect.stringContaining("sharper edges"),
      expect.stringContaining("sharper edges"),
    ]);
  });

  it("keeps the part length a local SeedVR2 setting", async () => {
    const app = await partsSetup();
    await expect(
      app.parts.plan({ ...app.request, partSeconds: 60 }, app.session),
    ).rejects.toMatchObject({ code: "part_length_fixed" });
    expect(app.store.data.sources.map((s) => s.id)).toEqual(["mix-source"]);
  });

  it("sends a failed part once when two retries race", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    const submit = app.bfl.submit.bind(app.bfl);
    vi.spyOn(app.bfl, "submit").mockImplementation(async (...args) => {
      if (app.bfl.submissions === 1) {
        app.bfl.submissions++;
        throw new AppError(502, "Submission uncertain.", "submission_unknown");
      }
      return submit(...args);
    });
    await app.parts.confirm(set.id, app.session, set.quoteId);
    const { set: quoted } = await app.parts.retry(set.id, 1, app.session);
    const first = app.parts.confirmRetry(
      set.id,
      1,
      app.session,
      quoted.parts[1].retryQuote!.id,
    );
    // While the first is being sent, the part takes no new retry.
    await expect(app.parts.retry(set.id, 1, app.session)).rejects.toMatchObject(
      { code: "part_busy" },
    );
    await first;
    expect(sent(app)).toBe(3);
    await expect(
      app.parts.confirmRetry(
        set.id,
        1,
        app.session,
        quoted.parts[1].retryQuote!.id,
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(sent(app)).toBe(3);
  });
});

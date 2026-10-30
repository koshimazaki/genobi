import { describe, expect, it } from "vitest";
import { approvedRun, type Approval } from "../src/scrolls/approval";
import type { GenerateInput } from "../shared/types";

const now = Date.parse("2026-10-23T10:00:00Z");
const approval = (over: Partial<Approval> = {}): Approval => ({
  quote: {
    id: "7f3c2a10-1b2c-4d5e-8f90-123456789abc",
    expiresAt: new Date(now + 60_000).toISOString(),
  } as Approval["quote"],
  input: {
    generator: "image",
    model: "flux-3-klein",
    description: "Two ninjas cross the rooftops.",
  } as GenerateInput,
  revision: 4,
  idempotency: "c1d2e3f4-0000-4000-8000-000000000001",
  prompt: "Two ninjas cross the rooftops.",
  label: "The sheet",
  generation: { entry: "flux-3-klein", references: [] },
  ...over,
});

describe("a Scrolls generation runs only from the quote the person approved", () => {
  it("submits exactly the quoted input with that quote's id and key", () => {
    const quoted = approval();
    const run = approvedRun(quoted, 4, now);
    expect(run.input).toBe(quoted.input);
    expect(run.approval).toEqual({
      quoteId: quoted.quote.id,
      idempotency: quoted.idempotency,
    });
  });

  it("refuses with no quote, after an edit and once the quote expires", () => {
    expect(() => approvedRun(undefined, 4, now)).toThrow(/stale/);
    expect(() => approvedRun(approval(), 5, now)).toThrow(/stale/);
    expect(() =>
      approvedRun(
        approval({
          quote: {
            ...approval().quote,
            expiresAt: new Date(now).toISOString(),
          },
        }),
        4,
        now,
      ),
    ).toThrow(/stale/);
  });
});

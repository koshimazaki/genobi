import { describe, expect, it, vi } from "vitest";
import { copyChoice } from "../src/director/project-copy-choice";
import type { Bundle } from "../src/director/bundle";

const bundle = (revision: number) =>
  ({ project: { id: "p", revision } }) as unknown as Bundle;

function choice(state: {
  revision: number;
  local: number;
  server: number;
  overwritten: number;
  keptAt: number;
}) {
  const accept = vi.fn(),
    restore = vi.fn(),
    notice = vi.fn(),
    reoffer = vi.fn();
  const made = copyChoice({
    id: "p",
    revision: 4,
    kind: "saved-copy",
    overwrittenAt: 2,
    current: () => bundle(state.revision),
    synced: () => ({ local: state.local, server: state.server }),
    counters: () => [state.overwritten, state.keptAt],
    accept,
    notice,
    reoffer,
    restore,
  });
  return { made, accept, restore, notice, reoffer };
}

describe("the saved-copy choice", () => {
  it("keeps the saved copy after an earlier choice went unanswered", () => {
    // Two replacements, neither acknowledged: answering the latest settles both.
    const { made, accept } = choice({
      revision: 4,
      local: 4,
      server: 4,
      overwritten: 2,
      keptAt: 0,
    });
    made.keepTheirs!();
    expect(accept).toHaveBeenCalledOnce();
  });

  it("does not accept once a newer replacement happened", () => {
    const { made, accept } = choice({
      revision: 4,
      local: 4,
      server: 4,
      overwritten: 3,
      keptAt: 0,
    });
    made.keepTheirs!();
    expect(accept).not.toHaveBeenCalled();
  });

  it("refuses to restore an older draft over newer edits", () => {
    const { made, restore, notice } = choice({
      revision: 5,
      local: 4,
      server: 4,
      overwritten: 2,
      keptAt: 1,
    });
    made.keepMine();
    expect(restore).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(
      "Project changed; review before restoring an older draft.",
    );
  });

  it("asks again when the server moved on", () => {
    const { made, restore, reoffer } = choice({
      revision: 4,
      local: 4,
      server: 5,
      overwritten: 2,
      keptAt: 1,
    });
    made.keepMine();
    expect(restore).not.toHaveBeenCalled();
    expect(reoffer).toHaveBeenCalledOnce();
  });
});

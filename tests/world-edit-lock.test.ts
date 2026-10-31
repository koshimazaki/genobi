import { expect, it, vi } from "vitest";
import { createEditLock } from "../src/world-builder/edit-lock";

it("keeps a guarded edit locked when Stop releases the playback request", () => {
  const apply = vi.fn();
  const lock = createEditLock(apply);
  lock.set(true);
  const release = lock.hold();
  lock.set(false);
  expect(apply).toHaveBeenLastCalledWith(true);
  release();
  expect(apply).toHaveBeenLastCalledWith(false);
});

it("preserves a newer playback lock when an async hold is released", () => {
  const apply = vi.fn();
  const lock = createEditLock(apply);
  const release = lock.hold();
  lock.set(true);
  release();
  expect(apply).toHaveBeenLastCalledWith(true);
  lock.set(false);
  expect(apply).toHaveBeenLastCalledWith(false);
});

it("retains overlapping holds and makes each release idempotent", () => {
  const apply = vi.fn();
  const lock = createEditLock(apply);
  const first = lock.hold();
  const second = lock.hold();
  first();
  first();
  expect(apply).toHaveBeenLastCalledWith(true);
  second();
  expect(apply).toHaveBeenLastCalledWith(false);
  const calls = apply.mock.calls.length;
  second();
  expect(apply).toHaveBeenCalledTimes(calls);
});

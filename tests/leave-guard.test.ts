// Box 1.6: the wordmark goes home without the browser's leave-page dialog
// only when the work is saved. The Director guards unloads with
// `guardUnload` while it holds undo history; the wordmark's click asks every
// flusher (the project copy's `CopySync.flush`) to save, drops the guard
// only when each confirms, and otherwise leaves the browser to ask.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

/** A `beforeunload` as the browser sends it: `returnValue` unset. */
function unload() {
  const event = new Event("beforeunload", { cancelable: true });
  Object.defineProperty(event, "returnValue", {
    value: undefined,
    writable: true,
  });
  window.dispatchEvent(event);
  return event as BeforeUnloadEvent;
}
const click = (keys: Partial<MouseEvent> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  preventDefault: vi.fn(),
  ...keys,
});

/** The Director with history, and what an unload sees after `leave`. */
async function guarded() {
  const guard = await import("../src/director/leave-guard");
  window.addEventListener("beforeunload", guard.guardUnload);
  const seen: BeforeUnloadEvent[] = [];
  const order: string[] = [];
  const navigate = (url: string) => {
    order.push(`navigate ${url}`);
    seen.push(unload());
  };
  return { guard, seen, order, navigate };
}

describe("the wordmark's trip home", () => {
  it("never registers returnValue once every copy confirms it is saved", async () => {
    const { guard, seen, order, navigate } = await guarded();
    // A reload elsewhere still asks.
    expect(unload().returnValue).toBe("");
    guard.flushBeforeLeaving(async () => {
      order.push("flushed");
      return true;
    });
    await guard.goHome(click(), navigate);
    expect(order).toEqual(["flushed", "navigate /"]);
    expect(seen[0].returnValue).toBeUndefined();
    expect(seen[0].defaultPrevented).toBe(false);
  });

  it("keeps the guard where no copy confirms: the hosted studio, a failed save", async () => {
    const hosted = await guarded();
    // No flusher registered: nothing on a server holds this work.
    await hosted.guard.goHome(click(), hosted.navigate);
    expect(hosted.seen[0].returnValue).toBe("");
    vi.resetModules();
    const failed = await guarded();
    failed.guard.flushBeforeLeaving(async () => true);
    failed.guard.flushBeforeLeaving(async () => false);
    await failed.guard.goHome(click(), failed.navigate);
    expect(failed.order).toEqual(["navigate /"]);
    expect(failed.seen[0].returnValue).toBe("");
  });

  it("a slow save goes home after its limit with the guard in place", async () => {
    vi.useFakeTimers();
    try {
      const { guard, seen, navigate } = await guarded();
      guard.flushBeforeLeaving(() => new Promise(() => {}));
      const leaving = guard.leaveHome(navigate);
      await vi.advanceTimersByTimeAsync(2000);
      await leaving;
      expect(seen).toHaveLength(1);
      expect(seen[0].returnValue).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the rendered wordmark link", () => {
  it("a plain click prevents the link and navigates; a modified one does not", async () => {
    const { HomeLink } = await import("../src/components/Wordmark");
    const navigate = vi.fn();
    const link = HomeLink({ navigate });
    expect(link.props).toMatchObject({ href: "/", className: "brand-home" });
    const plain = click();
    link.props.onClick(plain);
    expect(plain.preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    navigate.mockClear();
    for (const keys of [{ metaKey: true }, { ctrlKey: true }, { button: 1 }]) {
      const modified = click(keys);
      link.props.onClick(modified);
      expect(modified.preventDefault).not.toHaveBeenCalled();
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(navigate).not.toHaveBeenCalled();
  });
});

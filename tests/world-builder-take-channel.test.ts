import { describe, expect, it } from "vitest";
import { presetRecipe } from "../src/world-builder/recipe";
import { keepOnce, takeChannel } from "../src/world-builder/take-channel";
import {
  createTakeLibrary,
  memoryBackend,
} from "../src/world-builder/take-library";
import type { Take } from "../src/world-builder/export-take";

const take = (name: string): Take => ({
  name,
  video: new Blob([new Uint8Array(100)], { type: "video/webm" }),
  first: new Blob(["png"], { type: "image/png" }),
  manifest: new Blob(
    [
      JSON.stringify({
        frameCount: 121,
        duration: 121 / 24,
        recipe: presetRecipe("Studio"),
      }),
    ],
    { type: "application/json" },
  ),
});

/**
 * The session's take as React would batch it: the latest value wins and
 * nothing renders in between, so an observer of the state alone sees null.
 */
function batchedSession() {
  const channel = takeChannel();
  let state: Take | null = null;
  return {
    onTake: channel.subscribe,
    setTake(next: Take | null) {
      state = next;
      if (next) channel.publish(next);
    },
    rendered: () => state,
  };
}

describe("takes reach the library as they are produced", () => {
  it("keeps a capture even when a configure clears the take straight after", async () => {
    const library = createTakeLibrary(memoryBackend());
    const appends: Promise<unknown>[] = [];
    const keep = keepOnce((t: Take) => {
      const done = library.append(t);
      appends.push(done);
      return done;
    });
    const session = batchedSession();
    session.onTake(keep);
    // await directorScene.capture(); then configure() at once.
    const captured = take("capture-then-configure");
    session.setTake(captured);
    session.setTake(null);
    expect(session.rendered()).toBeNull();
    await Promise.all(appends);
    expect(library.list().map((t) => t.name)).toEqual([
      "capture-then-configure",
    ]);
  });

  it("adds a take once however often it is published", async () => {
    const library = createTakeLibrary(memoryBackend());
    const keep = keepOnce((t: Take) => library.append(t));
    const channel = takeChannel();
    channel.subscribe((t) => void keep(t));
    const one = take("once");
    channel.publish(one);
    channel.publish(one);
    await keep(take("other"));
    expect(
      library
        .list()
        .map((t) => t.name)
        .sort(),
    ).toEqual(["once", "other"]);
  });

  it("stops telling a listener that unsubscribed", () => {
    const channel = takeChannel();
    const heard: string[] = [];
    const stop = channel.subscribe((t) => heard.push(t.name));
    channel.publish(take("a"));
    stop();
    channel.publish(take("b"));
    expect(heard).toEqual(["a"]);
  });
});

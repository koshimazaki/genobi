import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunLocationState } from "../shared/comfy/run-location";
import { workflowCatalogue } from "../shared/comfy/workflows";
import type { Job } from "../shared/types";
import { saveRunLocation } from "../src/run-settings";
import {
  expectedHeaders,
  resetSettingsForTests,
  settingSaver,
  settingsHold,
  useSettingsStore,
} from "../src/settings-store";
import { useComposer } from "../src/useComposer";
import { isRestoring, restoreRun } from "../src/useRecreate";

// A Recreate whose take is still being read is superseded by any newer setup
// choice: a settings save, another clip or title restored into the composer,
// another model. It then writes nothing and releases Generate. With nothing
// newer, it still restores the run's template and run location.
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
};
const job = (id: string) =>
  ({ id, generator: "video", model: "ltx-2.5-akuspace" }) as Job;
/** A recorded Cloud run on the no-LoRA template. */
const cloudTake = () =>
  Response.json({
    take: {
      recipe: {
        id: "ltx-2-5-akuspace",
        route: "workflow",
        workflow: "ltx-2-5-t2v",
        location: "cloud",
      },
    },
  });

/** The local server's settings, as the studio's fetch sees them. */
let server: {
  location: "local" | "cloud";
  workflow?: string;
  revision: number;
};
let take: ReturnType<typeof deferred<Response>>;
let posts: string[];
const locationAnswer = () =>
  ({
    revision: server.revision,
    location: server.location,
    choices: ["local", "cloud"],
    fixed: false,
  }) as RunLocationState;
const catalogueAnswer = () =>
  workflowCatalogue(
    (entry) => (entry === "ltx-2-5-akuspace" ? server.workflow : undefined),
    false,
    server.revision,
  );

beforeEach(() => {
  server = { location: "local", revision: 10 };
  take = deferred<Response>();
  posts = [];
  resetSettingsForTests({
    "run-location": async () => locationAnswer(),
    workflow: async () => catalogueAnswer(),
  });
  useSettingsStore.setState({
    location: undefined,
    workflows: {},
    restoring: false,
    held: {},
    saving: {},
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/takes/")) return take.promise;
    if (init?.method === "POST") {
      posts.push(url);
      const body = JSON.parse(String(init.body));
      server.revision++;
      if (url.endsWith("/run-location")) server.location = body.location;
      else server.workflow = body.template;
    }
    return Response.json(
      url.includes("workflows") ? catalogueAnswer() : locationAnswer(),
    );
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetSettingsForTests();
});

/** The composer hook's own calls, captured from one render. */
function composer() {
  let hook!: ReturnType<typeof useComposer>;
  function Probe() {
    hook = useComposer();
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return hook;
}

describe("a Recreate whose take is still being read", () => {
  it("restores the run's setup when nothing newer was chosen", async () => {
    const recreating = restoreRun(job("a"), () => {});
    expect(isRestoring()).toBe(true);
    take.resolve(cloudTake());
    await recreating;
    expect(posts).toEqual([
      "/api/settings/workflows/selection",
      "/api/settings/run-location",
    ]);
    expect(server).toMatchObject({
      location: "cloud",
      workflow: "ltx-2-5-t2v",
    });
    expect(expectedHeaders()).toEqual({ "Genobi-Run-Location": "cloud" });
    expect(isRestoring()).toBe(false);
  });

  it("is superseded by a newer settings save: Local stands", async () => {
    const recreating = restoreRun(job("a"), () => {});
    // The person picks Local while the take of a Cloud run is being read.
    await settingSaver("run-location", () => {}).save(locationAnswer(), () =>
      saveRunLocation("local"),
    );
    take.resolve(cloudTake());
    await recreating;
    expect(posts).toEqual(["/api/settings/run-location"]);
    expect(server.location).toBe("local");
    expect(useSettingsStore.getState().location).toBe("local");
    expect(isRestoring()).toBe(false);
    expect(settingsHold()).toBeNull();
  });

  it("is superseded by another clip restored into the composer", async () => {
    const { dispatch } = composer();
    const recreating = restoreRun(job("a"), () => {});
    // A title click (`applyPrompt`) restores another run into the composer.
    dispatch({ type: "restore-prompt", job: job("b") });
    take.resolve(cloudTake());
    await recreating;
    expect(posts).toEqual([]);
    expect(server.location).toBe("local");
    expect(isRestoring()).toBe(false);
  });

  it("is superseded by another model chosen in the composer", async () => {
    const { set } = composer();
    const recreating = restoreRun(job("a"), () => {});
    set("model", "ltx-2.5");
    take.resolve(cloudTake());
    await recreating;
    expect(posts).toEqual([]);
    expect(isRestoring()).toBe(false);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { progressLine } from "../shared/progress-line";
import {
  ACTIVITY_CELLS,
  HUD_CELLS,
  energyLine,
  jobsLine,
  savedLine,
  walkersActivityLine,
} from "../shared/walkers/hud";
import { assignJob, createLevel, stepWalkers } from "../shared/walkers/sim";
import { activityNow, setActivity, setBackgroundActivity } from "../src/busy";
import { headerProgress } from "../src/components/LoadProgress";
import { deckNow } from "../src/deck/deck-now";
import DeckLog from "../src/deck/DeckLog";
import { renderToStaticMarkup } from "react-dom/server";
import { useWalkers } from "../src/deck/walkers/konami";
import WalkersSlot from "../src/deck/walkers/WalkersSlot";
import { WALKERS_ACTIVITY } from "../src/deck/walkers/useWalkersActivity";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  setActivity("job-1", undefined);
  setBackgroundActivity(WALKERS_ACTIVITY, undefined);
});

const walkersEntry = () => activityNow().find((a) => a.id === WALKERS_ACTIVITY);

describe("the walkers HUD", () => {
  it("is written with the studio's progress lines", () => {
    let s = createLevel(1);
    for (let t = 0; t < 4; t++) s = stepWalkers(s).state;
    // One creature out, four still behind the door; none saved of four.
    expect(savedLine(s)).toBe(
      progressLine("SAVED 0/4", 0, undefined, HUD_CELLS),
    );
    expect(energyLine(s)).toBe(
      progressLine("ENERGY 5/5", 1, undefined, HUD_CELLS),
    );
    expect(savedLine(s)).toMatch(/^SAVED 0\/4 {2}0% [⣀]{5}$/);
    s = assignJob(s, 0, "dig").state;
    expect(jobsLine(s)).toBe("DIG 1 · BUILD 0 · BLOCK 0");
    for (let t = 0; t < 200 && s.status === "playing"; t++)
      s = stepWalkers(s).state;
    expect(s.status).toBe("won");
    expect(savedLine(s)).toBe(
      progressLine("SAVED 5/4", 1, undefined, HUD_CELLS),
    );
    expect(energyLine(s)).toBe(
      progressLine("ENERGY 0/5", 0, undefined, HUD_CELLS),
    );
    expect(walkersActivityLine(s)).toBe(
      progressLine(
        "WALKERS · FIELD 2 SOFT FLOOR · SAVED 5/4 · HOME",
        1,
        undefined,
        ACTIVITY_CELLS,
      ),
    );
  });
});

describe("the walkers activity line", () => {
  it("never outranks a real job, in the deck bar or the wordmark's loader", () => {
    setActivity("job-1", "GENERATING KLEIN IMAGE  40% ⣿⣿⣀⣀");
    setBackgroundActivity(
      WALKERS_ACTIVITY,
      walkersActivityLine(createLevel(0)),
    );
    expect(activityNow().at(-1)?.id).toBe("job-1");
    expect(activityNow()[0]).toMatchObject({
      id: WALKERS_ACTIVITY,
      background: true,
    });
    const bar = deckNow({
      activity: activityNow(),
      linked: [],
      supervisor: { connected: false },
    });
    expect(bar).toBe("GENERATING KLEIN IMAGE  40% ⣿⣿⣀⣀");
    expect(headerProgress(activityNow())?.percent).toBe(40);
    // A job with no reported percent is still not covered by the game's bar.
    setActivity("job-1", "GENERATING KLEIN IMAGE  12s");
    expect(headerProgress(activityNow())).toBeUndefined();
    // Alone, the game shows.
    setActivity("job-1", undefined);
    expect(headerProgress(activityNow())?.label).toBe(
      "WALKERS · FIELD 1 TURN AROUND · SAVED 0/4",
    );
  });

  it("is not a step of the work in the deck's log", () => {
    const markup = renderToStaticMarkup(
      <DeckLog
        activity={[
          {
            id: WALKERS_ACTIVITY,
            line: walkersActivityLine(createLevel(0)),
            background: true,
          },
        ]}
        actors={[]}
        linked={[]}
        supervisor={{ connected: false }}
      />,
    );
    expect(markup).not.toContain("WALKERS");
    expect(markup).toContain("No linked agent in this view");
  });

  it("is published while the game is open and cleared on Esc and on unmount", () => {
    function Deck() {
      const walkers = useWalkers();
      return (
        <WalkersSlot walkers={walkers}>
          <p>visualiser</p>
        </WalkersSlot>
      );
    }
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<Deck />));
    const press = (key: string) =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      });
    const konami = () =>
      [
        "ArrowUp",
        "ArrowUp",
        "ArrowDown",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowLeft",
        "ArrowRight",
        "b",
        "a",
      ].forEach(press);
    expect(walkersEntry()).toBeUndefined();
    konami();
    expect(document.querySelector(".walkers")).not.toBeNull();
    expect(walkersEntry()?.line).toMatch(
      /^WALKERS · FIELD 1 TURN AROUND · SAVED 0\/4 {2}0% /,
    );
    expect(document.querySelector(".walkers-hud")?.textContent).toContain(
      "SAVED 0/4",
    );
    press("Escape");
    expect(document.querySelector(".walkers")).toBeNull();
    expect(walkersEntry()).toBeUndefined();
    konami();
    expect(walkersEntry()).toBeDefined();
    act(() => root!.unmount());
    root = null;
    expect(walkersEntry()).toBeUndefined();
  });
});

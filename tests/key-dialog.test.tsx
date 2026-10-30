import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitKey } from "../src/components/KeyDialog";
import {
  serverKeysChanged,
  serverKeysRead,
  serverKeysSeen,
} from "../src/useServerKey";
import type { KeysStatus } from "../shared/keys";

// The local dialogue's two duties beside the Keychain slots: a replaced key
// is a new connection the account must verify again, and a run started on a
// page key can still be handed that key. The browser half of both is
// `scripts/check-key-dialog.mjs`.
const status = (comfy: number, bfl = 0, connected = true): KeysStatus => ({
  keychain: true,
  comfy: { connected, source: "keychain", revision: comfy },
  bfl: { connected: false, revision: bfl },
});

describe("a saved key change", () => {
  it("is a new connection even when a key was already connected", () => {
    const connected = { connected: true, connection: 3, revision: "1.0" };
    const replaced = serverKeysChanged(connected, serverKeysSeen(status(2)));
    expect(replaced).toEqual({
      connected: true,
      connection: 4,
      revision: "2.0",
      // Which slots hold a key, so the header shows a balance for each.
      slots: { comfy: true, bfl: false },
    });
    expect(
      serverKeysChanged(replaced, serverKeysSeen(status(3, 0, false))),
    ).toMatchObject({ connected: false, connection: 5 });
  });
});

describe("a key status the dialogue reads", () => {
  it("connects the page when another window saved the first key", () => {
    const page = { connected: false, connection: 0, revision: "0.0" };
    expect(serverKeysRead(page, serverKeysSeen(status(1)))).toEqual({
      connected: true,
      connection: 1,
      revision: "1.0",
      slots: { comfy: true, bfl: false },
    });
  });
  it("is a new connection when another window replaced a connected key", () => {
    const page = { connected: true, connection: 2, revision: "1.0" };
    expect(serverKeysRead(page, serverKeysSeen(status(2)))).toMatchObject({
      connected: true,
      connection: 3,
    });
  });
  it("is no new connection when nothing changed", () => {
    const page = { connected: true, connection: 2, revision: "1.0" };
    expect(serverKeysRead(page, serverKeysSeen(status(1)))).toBe(page);
  });
});

describe("the visit's key in the local dialogue", () => {
  it("asks for the key a waiting run started with, for page memory only", () => {
    const html = renderToStaticMarkup(<VisitKey waiting onSave={() => {}} />);
    expect(html).toContain("RUN IN PROGRESS");
    expect(html).toMatch(/<input id="visit-key" type="password"/);
    expect(html).toContain("not saved in the Keychain");
    expect(html).toContain("Resume the run");
  });
  it("offers to forget a visit's key once nothing waits on it", () => {
    const html = renderToStaticMarkup(
      <VisitKey waiting={false} onSave={() => {}} />,
    );
    expect(html).not.toContain("<input");
    expect(html).toContain("Forget the visit’s key");
  });
});

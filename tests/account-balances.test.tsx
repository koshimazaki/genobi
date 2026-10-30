import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServerKeys } from "../server/keys";
import { balanceText, payerText, priceText } from "../src/balance-format";
import ComposerToolbar from "../src/components/ComposerToolbar";
import { initialComposer } from "../src/useComposer";
import AccountBalance, { balanceSlots } from "../src/components/AccountBalance";
import { runPayer } from "../src/run-mode";
import { readBalances } from "../src/useBalances";
import { readyEntry, registry } from "../shared/registry";
import {
  chooseKey,
  chooseKeyKind,
  keyKind,
  payingKeyKind,
} from "../shared/provider";
import { COMFY, fakeComfy } from "./keys-harness";
import { setup } from "./server-harness";

// With a Comfy and a BFL key both held, the header showed one balance (the
// Comfy account) and nothing said which key a FLUX run would spend. Each
// account now has its own readout, and the composer names the paying key from
// the rule the server uses to choose it.
const BFL = "test-server-key"; // the harness's fake BFL answers 1,250 credits

async function bothKeys() {
  const { provider } = fakeComfy();
  provider.balance = async () => ({
    usdCents: 830,
    checkedAt: new Date().toISOString(),
  });
  return setup(
    undefined,
    undefined,
    undefined,
    new ServerKeys({ comfy: COMFY, bfl: BFL }),
    undefined,
    provider,
  );
}

describe("the balances a server with both keys reports", () => {
  it("names the held slots in health, never the keys", async () => {
    const { base } = await bothKeys();
    const text = await (await fetch(`${base}/api/health`)).text();
    expect(JSON.parse(text).keySlots).toEqual({ comfy: true, bfl: true });
    expect(text).not.toContain(COMFY);
    expect(text).not.toContain(BFL);
  });

  it("reads each account by its own slot", async () => {
    const { base, bfl } = await bothKeys();
    const read = async (query: string) =>
      (await fetch(`${base}/api/credits${query}`)).json();
    expect(await read("?provider=comfy")).toMatchObject({
      credits: 830,
      provider: "comfy",
    });
    expect(await read("?provider=bfl")).toMatchObject({
      credits: 1250,
      provider: "bfl",
    });
    // Unnamed, the Comfy account, as before.
    expect(await read("")).toMatchObject({ provider: "comfy" });
    expect(bfl.creditKeys).toEqual([BFL]);
  });

  it("reads both accounts in one request, each answering on its own", async () => {
    const { base, bfl } = await bothKeys();
    const both = await (await fetch(`${base}/api/credits?provider=all`)).json();
    expect(both.balances).toEqual([
      { provider: "comfy", credits: 830, checkedAt: expect.any(String) },
      { provider: "bfl", credits: 1250, checkedAt: expect.any(String) },
    ]);
    expect(bfl.creditKeys).toEqual([BFL]);
    expect(JSON.stringify(both)).not.toContain(BFL);
    // A visit's key reads only that key, as on the hosted Worker.
    const visit = await (
      await fetch(`${base}/api/credits?provider=all`, {
        headers: { "x-byo-key": "visitor-balance-key" },
      })
    ).json();
    expect(visit).toMatchObject({ credits: 0, provider: "bfl" });
  });

  it("keeps a failed account's error beside the other's balance", () => {
    const at = new Date().toISOString();
    expect(
      readBalances(
        [
          { provider: "comfy", credits: 830, checkedAt: at },
          { provider: "bfl", error: "The API key was not accepted." },
        ],
        ["comfy", "bfl"],
      ),
    ).toEqual({
      comfy: {
        balance: { provider: "comfy", credits: 830, checkedAt: at },
        loading: false,
      },
      bfl: { error: "The API key was not accepted.", loading: false },
    });
  });

  it("refuses a named slot that holds no key rather than showing the other", async () => {
    const { base } = await setup(
      undefined,
      undefined,
      undefined,
      new ServerKeys({ bfl: BFL }),
    );
    const response = await fetch(`${base}/api/credits?provider=comfy`);
    expect(response.status).toBe(400);
  });
});

describe("the header's readouts", () => {
  it("shows one per account only when both server keys are held", () => {
    expect(balanceSlots("", { comfy: true, bfl: true })).toEqual([
      "comfy",
      "bfl",
    ]);
    expect(balanceSlots("", { comfy: true, bfl: false })).toEqual(["comfy"]);
    expect(balanceSlots("", { comfy: false, bfl: true })).toEqual(["bfl"]);
    expect(balanceSlots("", undefined)).toEqual([undefined]);
    // A visit's key is the only key a run on this page spends.
    expect(balanceSlots("comfyui-visit", { comfy: true, bfl: true })).toEqual([
      undefined,
    ]);
  });

  it("renders a labelled, separately refreshable readout for each", () => {
    const html = renderToStaticMarkup(
      <AccountBalance
        apiKey=""
        hasServerKey
        slots={{ comfy: true, bfl: true }}
        connection={0}
        revision=""
        onVerified={() => {}}
      />,
    );
    expect(html).toContain("CHECKING COMFY KEY");
    expect(html).toContain("CHECKING BFL KEY");
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("reads both accounts in dollars, BFL's credits in the hover text", () => {
    const at = new Date().toISOString();
    expect(
      balanceText({ credits: 830, checkedAt: at, provider: "comfy" }),
    ).toMatchObject({ label: "COMFY", amount: "$8.30" });
    const bfl = balanceText({ credits: 1250, checkedAt: at, provider: "bfl" });
    expect(bfl).toMatchObject({ label: "BFL", amount: "$12.50" });
    expect(bfl.detail).toBe(
      "BFL balance $12.50: 1,250 BFL credits (1 credit = $0.01)",
    );
    expect(
      balanceText({ credits: null, checkedAt: at, provider: "bfl" }),
    ).toMatchObject({ label: "BFL KEY OK", amount: "no balance" });
  });
});

describe("a run's price in both units", () => {
  it("names BFL credits at BFL's documented 1 credit = $0.01", () => {
    expect(priceText(0.8, "bfl", null, 210)).toMatchObject({
      amount: "$0.80",
      unit: "80 BFL cr",
    });
    expect(priceText(1.7, "bfl", null, 210).detail).toBe(
      "Paid with your BFL key: $1.70 est., 170 BFL credits (1 credit = $0.01)",
    );
  });
  it("uses the entry's own Comfy credits when it is priced in them", () => {
    expect(priceText(1.29, "comfy", 272, 210)).toMatchObject({
      amount: "$1.29",
      unit: "272 Comfy cr",
    });
  });
  it("marks Comfy credits converted from a dollar price as approximate", () => {
    const price = priceText(0.8, "comfy", null, 210);
    expect(price.unit).toBe("≈168 Comfy cr");
    expect(price.detail).toContain("about 168 Comfy credits");
  });
  it("shows dollars, the unit and the paying key under Generate", () => {
    const html = renderToStaticMarkup(
      <ComposerToolbar
        state={{ ...initialComposer, generator: "video", model: "flux-3" }}
        update={() => {}}
        estimate={0.8}
        estimateCredits={null}
        action={null}
        keyKind="bfl"
      />,
    );
    expect(html).toContain(
      "<strong>$0.80</strong><span>80 BFL CR / RUN</span>",
    );
    expect(html).toContain("BFL KEY");
    expect(html).toContain('title="Paid with your BFL key');
  });
});

describe("the key a run spends", () => {
  const generators = ["video", "image", "edit", "upscale", "audio"] as const;
  it("is the slot chooseKey picks, for every entry and every set of keys", () => {
    const sets = [
      { comfy: COMFY, bfl: BFL },
      { comfy: COMFY },
      { bfl: BFL },
      {},
    ];
    for (const entry of registry.flatMap((item) => readyEntry(item.id) ?? []))
      for (const generator of generators)
        for (const keys of sets) {
          const key = chooseKey(generator, entry.videoModel, keys);
          expect(
            chooseKeyKind(generator, entry.videoModel, {
              comfy: Boolean(keys.comfy),
              bfl: Boolean(keys.bfl),
            }),
          ).toBe(key && keyKind(key));
        }
  });

  it("is BFL for FLUX and its upscale with both keys, Comfy for Comfy-only routes", () => {
    const both = { comfy: true, bfl: true };
    expect(runPayer("", both, "video", "flux-3")).toBe("bfl");
    expect(runPayer("", both, "upscale", "flux-3")).toBe("bfl");
    expect(runPayer("", both, "video", "ltx-2.5")).toBe("comfy");
    expect(runPayer("", both, "upscale", "seedvr2-upscale")).toBe("comfy");
  });

  it("is the visit's key when the page holds one, and nothing when it cannot run", () => {
    const both = { comfy: true, bfl: true };
    expect(runPayer("comfyui-visit-key", both, "video", "flux-3")).toBe(
      "comfy",
    );
    expect(payingKeyKind("video", "ltx-2.5", { bfl: true })).toBeUndefined();
    expect(runPayer("", { bfl: true }, "video", "ltx-2.5")).toBeNull();
    expect(payerText("bfl")).toBe("Paid with your BFL key");
    expect(payerText("comfy")).toBe("Paid with your Comfy key");
  });
});

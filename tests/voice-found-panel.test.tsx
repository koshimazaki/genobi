// The mic's install panel looks before it downloads: "Use this one" per
// verified model found on the machine, and the download only after the
// search has answered.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { FoundVoiceModels } from "../src/voice/FoundVoiceModels";
import { readFoundVoiceModels } from "../src/voice/setup-api";

afterEach(() => vi.unstubAllGlobals());

const model = {
  folder: "/Users/someone/Documents/asr/Qwen3-ASR-0.6B",
  label: "~/Documents/asr/Qwen3-ASR-0.6B",
  source: "search" as const,
};
const panel = (props: Partial<Parameters<typeof FoundVoiceModels>[0]>) =>
  renderToStaticMarkup(
    <FoundVoiceModels
      searching={false}
      disabled={false}
      onUse={() => {}}
      {...props}
    />,
  );

it("says it is looking until the search answers", () => {
  expect(panel({ searching: true })).toContain(
    "Looking for Qwen3-ASR already on this machine…",
  );
  expect(panel({})).not.toContain("Use this one");
});

it("offers each verified copy with Use this one", () => {
  const html = panel({
    found: [model, { ...model, folder: "/b", label: "/b" }],
  });
  expect(html.match(/>Use this one</g)).toHaveLength(2);
  expect(html).toContain("<code>~/Documents/asr/Qwen3-ASR-0.6B</code>");
  expect(html).toContain("Using one skips the download.");
});

it("says none was found, so Install new downloads", () => {
  expect(panel({ found: [] })).toContain(
    "No verified copy of Qwen3-ASR is on this machine, so Install new downloads it.",
  );
});

it("reads the search fresh and keeps only well-formed answers", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ models: [model, { folder: 3 }, null] }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await readFoundVoiceModels()).toEqual([model]);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/voice/setup/found",
    expect.objectContaining({
      cache: "no-store",
      headers: { "X-Genobi-Agent": "1" },
    }),
  );
});

// These fixtures exercise local voice; hosted detection is covered separately.
vi.mock("../src/hosted-studio", () => ({
  readHostedStudio: async () => false,
  useHostedStudio: () => false,
}));

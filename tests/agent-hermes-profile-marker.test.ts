// The `genobi` profile's marker carries the tool allowlists, so a profile set
// up before a tool was added (genobi_skill in #70, genobi_machine) is applied
// again with the new list, and an unchanged profile is left as it is.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROFILE_MARKER,
  applyProfile,
  profileMarker,
  profileSettings,
  type HermesRun,
} from "../server/agent-hermes-profile";
import { BROWSER_TOOLS, GENOBI_TOOLS } from "../server/agent-runner";
import { fakeHermesConfig } from "./agent-harness";

const recorder = () => {
  const calls: string[][] = [];
  const run: HermesRun = async (args) => {
    calls.push(args);
  };
  return { calls, run };
};

async function profile() {
  const config = await fakeHermesConfig();
  const home = config.hermesHome!;
  const settings = profileSettings(config, "http://127.0.0.1:4431");
  return { home, settings, marker: path.join(home, PROFILE_MARKER) };
}

/** The `mcp_servers.genobi` value the profile was last given. */
const genobiServer = (calls: string[][]) =>
  JSON.parse(calls.find((args) => args[2] === "mcp_servers.genobi")![3]);

describe("the genobi profile's marker", () => {
  it("re-applies a profile written with an older tool list", async () => {
    const { home, settings, marker } = await profile();
    const old = GENOBI_TOOLS.filter((tool) => tool !== "genobi_machine");
    await writeFile(
      marker,
      profileMarker(settings, { genobi: old, browser: BROWSER_TOOLS }),
    );
    const { calls, run } = recorder();
    expect(await applyProfile(home, settings, run, {})).toBe(true);
    expect(genobiServer(calls).tools.include).toEqual(GENOBI_TOOLS);
    expect(genobiServer(calls).tools.include).toContain("genobi_machine");
    expect(await readFile(marker, "utf8")).toBe(profileMarker(settings));
  });

  it("re-applies a profile whose marker predates the tool lists", async () => {
    const { home, settings, marker } = await profile();
    // The marker as it was written before it named the tools.
    await writeFile(
      marker,
      `${JSON.stringify({ owner: "genobi", schema: 2, settings }, null, 2)}\n`,
    );
    const { calls, run } = recorder();
    expect(await applyProfile(home, settings, run, {})).toBe(true);
    expect(genobiServer(calls).tools.include).toContain("genobi_skill");
    expect(genobiServer(calls).tools.include).toContain(
      "genobi_take_to_project",
    );
  });

  it("leaves an unchanged profile byte-identical", async () => {
    const { home, settings, marker } = await profile();
    const first = recorder();
    expect(await applyProfile(home, settings, first.run, {})).toBe(true);
    const before = await readFile(marker);
    const again = recorder();
    expect(await applyProfile(home, settings, again.run, {})).toBe(false);
    expect(again.calls).toEqual([]);
    expect((await readFile(marker)).equals(before)).toBe(true);
  });
});

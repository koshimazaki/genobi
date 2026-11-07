import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { BrowserExports } from "../server/browser-exports";
import type { MemoryProjects } from "../server/memory-projects";
import {
  EXPORT_RETENTION_MS,
  EXPORT_TAB_TTL_MS,
} from "../shared/browser-export";

async function scrollTab() {
  let time = 1_000_000;
  const projects = {
    directory: await mkdtemp(join(tmpdir(), "genobi-scroll-reconnect-")),
    list: () => [],
    read: () => ({}),
  } as unknown as MemoryProjects;
  const service = new BrowserExports(projects, () => time);
  await service.load();
  const source = { kind: "scrolls" as const, id: "scroll-1", revision: 0 };
  const { tabId } = service.connect("owner", source);
  const { code } = service.createLink(tabId, "owner", source);
  service.link("agent", code);
  const linked = () => service.targets("agent").map((t) => t.source.id);
  const advance = (ms: number) => {
    time += ms;
  };
  return { service, source, tabId, linked, advance };
}

it("gives a Scroll's agent links back after a lost connection, to the same owner and Scroll only", async () => {
  const s = await scrollTab();
  expect(s.linked()).toEqual(["scroll-1"]);
  // A throttled background tab misses the 15-second heartbeat.
  s.advance(EXPORT_TAB_TTL_MS + 1);
  expect(s.linked()).toEqual([]);
  expect(() => s.service.connect("someone-else", s.source)).not.toThrow();
  expect(s.linked()).toEqual([]);
  s.service.connect("owner", { ...s.source, id: "scroll-2" });
  expect(s.linked()).toEqual([]);
  s.service.connect("owner", { ...s.source, revision: 3 });
  expect(s.linked()).toEqual(["scroll-1"]);
});

it("keeps no links after a deliberate disconnect, and lets kept links expire", async () => {
  const s = await scrollTab();
  s.service.disconnect(s.tabId, "owner");
  s.service.connect("owner", s.source);
  expect(s.linked()).toEqual([]);

  const lost = await scrollTab();
  lost.service.disconnect(lost.tabId, "owner", undefined, true);
  lost.advance(EXPORT_RETENTION_MS + 1);
  lost.service.targets("agent");
  lost.service.connect("owner", lost.source);
  expect(lost.linked()).toEqual([]);
});

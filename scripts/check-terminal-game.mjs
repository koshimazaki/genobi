/** Local-only terminal game, cadence and reduced-motion regression. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = ".local/terminal-game";
const { mkdir } = await import("node:fs/promises");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion,
    });
    await context.addInitScript(() => {
      localStorage.setItem("genobi-setup-seen-v1", "1");
      localStorage.setItem(
        "genobi.deck",
        JSON.stringify({ open: true, program: "metaballs" }),
      );
    });
    await context.route("**/api/**", (r) =>
      r.request().method() === "GET"
        ? r.fulfill({ json: { jobs: [], sources: [] } })
        : r.abort(),
    );
    const p = await context.newPage();
    await p.goto(base + "/?workspace=gallery");
    const art = p.locator(".deck-art");
    await art.waitFor();
    const first = await art.innerHTML();
    await p.waitForTimeout(300);
    assert.equal(first === (await art.innerHTML()), reducedMotion === "reduce");
    await p.getByRole("button", { name: "Pop next blob", exact: true }).click();
    await p
      .locator(".deck-game-status output")
      .filter({ hasText: "10 points · 7 blobs" })
      .waitFor();
    await p.getByRole("button", { name: "Reset game", exact: true }).click();
    assert.equal(
      await p.locator(".deck-game-status output").innerText(),
      "0 points · 6 blobs",
    );
    if (reducedMotion === "no-preference") {
      const changes = await p.evaluate(async () => {
        let n = 0;
        const observer = new MutationObserver(() => n++);
        observer.observe(document.querySelector(".ascii-screen"), {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        await new Promise((r) => setTimeout(r, 1000));
        observer.disconnect();
        return n;
      });
      console.log("Frame changes per second", changes);
      assert(changes >= 24 && changes <= 35);
      await p
        .getByRole("button", { name: "Pause visualiser", exact: true })
        .click();
      await p.waitForTimeout(50);
      const frame = await art.innerHTML();
      await p.waitForTimeout(250);
      assert.equal(frame, await art.innerHTML());
    }
    await p.mouse.move(5, 5);
    const target = await p.evaluate(async () => {
      const { metaballTargets } = await import("/shared/ascii/programs.ts");
      return metaballTargets(
        Number(document.querySelector(".deck-art").dataset.time),
      )[0];
    });
    const bounds = await art.boundingBox();
    await art.click({
      position: { x: target.x * bounds.width, y: target.y * bounds.height },
    });
    await p
      .locator(".deck-game-status output")
      .filter({ hasText: "10 points · 7 blobs" })
      .waitFor();
    const names = [];
    for (let i = 0; i < 3; i++) {
      names.push(
        await p.locator(".deck-vis-actions .deck-mode").first().innerText(),
      );
      await p.locator(".deck-vis-actions .deck-mode").first().click();
    }
    assert.deepEqual(names, [
      "VIS · METABALLS",
      "VIS · RAIN",
      "VIS · BLACKHOLE",
    ]);
    await p.screenshot({
      path: out + "/game-" + reducedMotion + ".png",
      fullPage: true,
    });
    await context.close();
    console.log("PASS game", reducedMotion);
  }
} finally {
  await browser.close();
}

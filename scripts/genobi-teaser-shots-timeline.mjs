// The Genobi teaser's version-3 shot (docs/genobi-teaser.md): the Editor's
// timeline, beside scripts/genobi-teaser-shots.mjs. Nothing is generated or
// spent: Regenerate only opens its field.
const ready = (page) =>
  page.getByText("Ready · local preview", { exact: true }).first().waitFor({
    timeout: 60000,
  });
const hideAssets = async (page) => {
  const hide = page.getByRole("button", { name: "Hide assets" });
  if (await hide.isVisible().catch(() => false)) await hide.click();
};

export const timeline = [
  // Version 3 (the owner: "move a clip, adjust timing"): the Editor's
  // timeline, a clip dragged along its lane, its end edge dragged to change
  // its length, then split at the playhead with the cut tool.
  {
    name: "ui-timeline",
    seconds: 10,
    async setup(page, base) {
      await page.goto(
        `${base}/director?example=dimensions-mix&workspace=editor`,
      );
      await ready(page);
      await hideAssets(page);
      await page.waitForTimeout(1500);
      await page.mouse.move(720, 600);
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, 32);
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(600);
    },
    async run(a) {
      const { page } = a;
      const clips = page.getByRole("button", {
        name: /^Select (Title|Caption|Scan)/,
      });
      let pick = clips.first();
      for (let i = 0; i < (await clips.count()); i++) {
        const b = await clips.nth(i).boundingBox();
        if (b && b.x > 420 && b.x + b.width < 1200 && b.y > 300 && b.y < 780) {
          pick = clips.nth(i);
          break;
        }
      }
      const r = await a.click(pick, "a clip");
      await a.wait(700);
      const W = 1440;
      const H = 810;
      const cx = (r.x + r.w / 2) * W;
      const cy = (r.y + r.h / 2) * H;
      // Move the clip along its lane.
      await page.mouse.down();
      await page.mouse.move(cx + 70, cy, { steps: 24 });
      await page.mouse.up();
      a.logClick({ x: (cx + 70) / W, y: cy / H }, "move the clip");
      await a.wait(900);
      // Drag its end edge to change its length.
      const end = (r.x + r.w) * W + 70 - 2;
      await page.mouse.move(end, cy, { steps: 14 });
      await page.mouse.down();
      await page.mouse.move(end - 60, cy, { steps: 22 });
      await page.mouse.up();
      a.logClick({ x: (end - 60) / W, y: cy / H }, "trim the edge");
      await a.wait(900);
      // Split it at the playhead with the cut tool.
      await a.click(
        page.getByRole("button", { name: "Split selected clip" }).first(),
        "cut tool",
      );
      await a.wait(900);
      // Send the edit back: Regenerate opens its field; nothing is sent.
      await a.click(
        page.getByRole("button", { name: /^Regenerate/ }).first(),
        "regenerate",
      );
      await a.wait(1600);
    },
  },
];

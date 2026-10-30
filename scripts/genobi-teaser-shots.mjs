// The Genobi teaser's studio shots, in the order the cut uses them
// (docs/genobi-teaser.md#the-footage). Each is a short, real walk through one
// part of the studio: `setup` brings the page to its first frame before the
// recording starts, `run` is what is recorded, `seconds` caps its length.
// Nothing here presses Generate, Submit, Approve, Confirm or Start: the
// composer, quotes and pickers are shown, never spent.
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).first();
const ready = (page) =>
  page.getByText("Ready · local preview", { exact: true }).first().waitFor({
    timeout: 60000,
  });
const hideAssets = async (page) => {
  const hide = page.getByRole("button", { name: "Hide assets" });
  if (await hide.isVisible().catch(() => false)) await hide.click();
};

import { taste } from "./genobi-teaser-shots-taste.mjs";
import { timeline } from "./genobi-teaser-shots-timeline.mjs";

export const shots = [
  {
    name: "ui-gallery",
    seconds: 12,
    async setup(page, base) {
      await page.goto(`${base}/`);
      await page.waitForTimeout(3500);
    },
    async run(a) {
      const { page } = a;
      await a.move({ x: 0.5, y: 0.55 }, "gallery");
      await a.wait(900);
      await a.move(
        page.getByRole("button", { name: "View Character piece" }),
        "character card",
      );
      await a.wait(1200);
      await a.wheel(560, 18);
      await a.wait(900);
      await a.wheel(-560, 14);
      await a.wait(500);
      await a.click(
        page.getByRole("button", { name: "Open only", exact: true }),
        "open only",
      );
      await a.wait(1400);
      await a.click(
        page.getByRole("button", { name: "Open only", exact: true }),
        "open only off",
      );
      await a.wait(800);
      await a.click(
        page.getByRole("button", { name: "View Dimensions mix" }),
        "open the mix",
      );
      await a.wait(3000);
    },
  },
  {
    name: "ui-camera",
    seconds: 15,
    async setup(page, base) {
      await page.goto(`${base}/`);
      await page.waitForTimeout(3000);
      await nav(page, "Camera").click();
      await page.waitForTimeout(1500);
      await hideAssets(page);
      await page.waitForTimeout(600);
    },
    async run(a) {
      const { page } = a;
      await a.move(
        page.getByRole("button", { name: "LTX models" }),
        "families",
      );
      await a.wait(500);
      await a.click(
        page.getByRole("button", { name: "Upscale models" }),
        "upscale family",
      );
      await a.wait(1600);
      await page.keyboard.press("Escape");
      await a.click(
        page.getByRole("button", { name: "H3 models" }),
        "h3 family",
      );
      await a.wait(1500);
      await page.keyboard.press("Escape");
      await a.click(
        page.getByRole("button", { name: "FLUX models" }),
        "flux family",
      );
      await a.wait(1300);
      await page.keyboard.press("Escape");
      await a.wait(300);
      const prompt = page
        .locator(".director-prompt, [contenteditable=true], textarea")
        .first();
      await a.click(prompt, "prompt");
      await page.keyboard.press("Meta+ArrowDown");
      await page.keyboard.type(" A slow push in as the creature wakes up.", {
        delay: 38,
      });
      await a.wait(900);
      await a.move(
        page.getByRole("button", { name: "Generate" }).first(),
        "quote",
      );
      await a.wait(2400);
    },
  },
  {
    name: "ui-camera-control",
    seconds: 11,
    async setup(page, base) {
      await page.goto(`${base}/`);
      await page.waitForTimeout(3000);
      await nav(page, "Camera").click();
      await page.waitForTimeout(1500);
      await hideAssets(page);
      await page.waitForTimeout(600);
    },
    // Camera direction: BFL's camera terms (docs/camera-wording.md), picked
    // and previewed, then cancelled; nothing is generated.
    async run(a) {
      const { page } = a;
      await a.click(
        page.getByRole("button", { name: /^Camera controls/ }).first(),
        "camera controls",
      );
      await a.wait(1200);
      await a.click(
        page
          .getByText("Movements", { exact: true })
          .filter({ visible: true })
          .first(),
        "movements",
      );
      await a.wait(900);
      await a.click(
        page
          .getByText("Arc shot", { exact: true })
          .filter({ visible: true })
          .first(),
        "arc shot",
      );
      await a.wait(1600);
      await a.click(
        page
          .getByText("Angles", { exact: true })
          .filter({ visible: true })
          .first(),
        "angles",
      );
      await a.wait(800);
      await a.click(
        page
          .getByText("High angle", { exact: true })
          .filter({ visible: true })
          .first(),
        "high angle",
      );
      await a.wait(1400);
      await a.click(
        page.getByRole("button", { name: "Replay camera preview" }).first(),
        "replay",
      );
      await a.wait(2400);
      await a.click(
        page.getByRole("button", { name: "Cancel", exact: true }).first(),
        "cancel",
      );
      await a.wait(500);
    },
  },
  {
    name: "ui-director",
    seconds: 12,
    async setup(page, base) {
      await page.goto(`${base}/director?example=dimensions-mix`);
      await ready(page);
      await hideAssets(page);
      await page.waitForTimeout(1500);
    },
    async run(a) {
      const { page } = a;
      await a.click(
        page.getByRole("button", { name: "Play preview" }).first(),
        "play",
      );
      await a.wait(4200);
      await a.move({ x: 0.7, y: 0.45 }, "the cut");
      await a.wait(1200);
      await a.wheel(420, 14);
      await a.wait(2600);
    },
  },
  {
    name: "ui-editor",
    seconds: 15,
    async setup(page, base) {
      await page.goto(
        `${base}/director?example=dimensions-mix&workspace=editor`,
      );
      await ready(page);
      await hideAssets(page);
      await page.waitForTimeout(1500);
    },
    async run(a) {
      const { page } = a;
      await a.click(
        page.getByRole("button", { name: "Play", exact: true }).first(),
        "play",
      );
      await a.wait(3800);
      await a.wheel(380, 12);
      await a.wait(800);
      // A clip the timeline shows now (the end card is past its right edge).
      const clips = page.getByRole("button", {
        name: /^Select (Title|Caption|Scan)/,
      });
      let pick = clips.first();
      for (let i = 0; i < (await clips.count()); i++) {
        const b = await clips.nth(i).boundingBox();
        if (b && b.x > 360 && b.x + b.width < 1300 && b.y > 300 && b.y < 780) {
          pick = clips.nth(i);
          break;
        }
      }
      await a.click(pick, "a clip");
      await a.wait(1200);
      const inspector = page.getByRole("button", {
        name: "Show inspector",
        exact: true,
      });
      if (await inspector.isVisible().catch(() => false))
        await a.click(inspector, "inspector");
      await a.wait(2400);
      await a.click(
        page.getByRole("button", { name: "Play", exact: true }).first(),
        "pause",
      );
      await a.wait(1600);
    },
  },
  {
    name: "ui-directions",
    seconds: 13,
    async setup(page, base) {
      await page.goto(`${base}/`);
      await page.waitForTimeout(3000);
      await nav(page, "Editor").click();
      await ready(page);
      await hideAssets(page);
      await page.waitForTimeout(1200);
    },
    async run(a) {
      const { page } = a;
      await a.wait(600);
      await a.click(
        page.getByRole("button", { name: "Shot and lens for Character / 1" }),
        "shot and lens",
      );
      await a.wait(900);
      await a.click(
        page.getByRole("button", { name: "Low angle", exact: true }),
        "low angle",
      );
      await a.wait(700);
      await a.click(
        page.getByRole("button", { name: "35mm", exact: true }),
        "35mm",
      );
      await a.wait(1200);
      await a.click(
        page.getByRole("button", { name: "Close directions" }),
        "close",
      );
      await a.wait(500);
      await a.wheel(-700, 14);
      await a.wait(600);
      await a.move(
        page.getByRole("button", { name: "Send to Genobi" }).first(),
        "send to genobi",
      );
      await a.wait(2400);
    },
  },
  {
    name: "ui-world",
    seconds: 14,
    async setup(page, base) {
      await page.goto(`${base}/`);
      await page.waitForTimeout(3000);
      await nav(page, "3D").click();
      await page.waitForTimeout(3500);
      await hideAssets(page);
      await page
        .locator('select[aria-label="Load preset"]')
        .selectOption("Club", { force: true });
      await page.waitForTimeout(2500);
      await page
        .locator('select[aria-label="Scene character"]')
        .selectOption("mannequin", { force: true });
      await page.waitForTimeout(4000);
    },
    async run(a) {
      const { page } = a;
      const preset = async (name, label) => {
        const select = page.locator('select[aria-label="Load preset"]');
        // The native select is hidden under its styled box: point at the box.
        const box = await select.locator("..").boundingBox();
        const rect = {
          x: box.x / 1440,
          y: box.y / 810,
          w: box.width / 1440,
          h: box.height / 810,
        };
        await a.move(rect, label);
        a.logClick(rect, label);
        await select.selectOption(name, { force: true });
      };
      await a.move({ x: 0.45, y: 0.45 }, "scene");
      await page.mouse.down();
      await a.move({ x: 0.6, y: 0.42 }, "orbit", 70);
      await page.mouse.up();
      await a.wait(500);
      await a.click(
        page
          .getByRole("button", { name: "Build", exact: true })
          .filter({ visible: true })
          .first(),
        "build",
      );
      await a.wait(1300);
      await a.click(
        page.getByRole("button", { name: "Rotate", exact: true }),
        "rotate tool",
      );
      await a.wait(700);
      await a.click(
        page.getByRole("button", { name: "Loop scene preview" }),
        "loop preview",
      );
      await a.wait(2200);
      await preset("Playground avatar", "preset playground");
      await a.wait(2600);
      await preset("Neuro shader", "preset neuro");
      await a.wait(2800);
    },
  },
  {
    name: "ui-swords",
    seconds: 10,
    async setup(page, base) {
      await page.goto(`${base}/`);
      await page.waitForTimeout(3000);
      await nav(page, "Dual Swords").click();
      await page.waitForTimeout(2500);
    },
    async run(a) {
      const { page } = a;
      await a.click(
        page.getByRole("button", { name: "Load A" }).nth(0),
        "load a",
      );
      await a.wait(1500);
      await a.click(
        page.getByRole("button", { name: "Load B" }).nth(2),
        "load b",
      );
      await a.wait(1500);
      await a.click(
        page.getByRole("button", { name: "Video A next frame" }),
        "next frame",
      );
      await a.click(
        page.getByRole("button", { name: "Video A next frame" }),
        "next frame",
      );
      await a.wait(600);
      await a.click(
        page.getByRole("button", { name: "▤ Timeline" }),
        "timeline",
      );
      await a.wait(2500);
    },
  },
  {
    name: "ui-scrolls",
    seconds: 10,
    async setup(page, base) {
      await page.goto(`${base}/`);
      await page.waitForTimeout(3000);
      await nav(page, "Scrolls").click();
      await page.waitForTimeout(2000);
      await hideAssets(page);
    },
    async run(a) {
      const { page } = a;
      await a.click(
        page.getByRole("button", { name: "Examples", exact: true }).first(),
        "examples",
      );
      await a.wait(1800);
      await a.click(
        page
          .getByRole("button", { name: "Character sheet", exact: true })
          .first(),
        "character sheet",
      );
      await a.wait(1800);
      await a.click(
        page.getByRole("button", { name: "Storyboard", exact: true }).first(),
        "storyboard",
      );
      await a.wait(1400);
      await a.click(
        page.getByRole("button", { name: "Edit camera for cell 3" }),
        "cell camera",
      );
      await a.wait(2000);
    },
  },
  {
    name: "ui-agent",
    seconds: 10,
    async setup(page, base) {
      await page.goto(`${base}/`);
      await page.waitForTimeout(3500);
    },
    async run(a) {
      const { page } = a;
      await a.click(
        page.getByRole("button", { name: "Open Genobi activity" }),
        "genobi",
      );
      await a.wait(900);
      await a.type(
        page.getByPlaceholder(/Type what to make/),
        "Cut my gallery clips into a 20 s teaser on the beat",
        "brief",
        42,
      );
      await a.wait(1200);
      await a.move(page.getByRole("button", { name: "Start Genobi" }), "start");
      await a.wait(1800);
    },
  },
  ...timeline,
  ...taste,
];

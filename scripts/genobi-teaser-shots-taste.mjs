// The Genobi teaser's version-2 shots (docs/genobi-teaser.md#the-footage):
// the taste layer's licence view and saving the project, beside
// scripts/genobi-teaser-shots.mjs. Nothing is generated or spent.
const ready = (page) =>
  page.getByText("Ready · local preview", { exact: true }).first().waitFor({
    timeout: 60000,
  });
const hideAssets = async (page) => {
  const hide = page.getByRole("button", { name: "Hide assets" });
  if (await hide.isVisible().catch(() => false)) await hide.click();
};

export const taste = [
  {
    name: "ui-licences",
    seconds: 10,
    async setup(page, base) {
      await page.goto(`${base}/taste`);
      await page.waitForTimeout(3500);
    },
    // The taste layer's choices: open or closed models, licences, and each
    // library's creator and terms.
    async run(a) {
      const { page } = a;
      const seen = (text) =>
        page.getByText(text, { exact: true }).filter({ visible: true }).first();
      await a.wheel(700, 16);
      await a.wait(400);
      await a.move(seen("Open or closed models"), "open or closed models");
      await a.wait(1400);
      await a.move(seen("Any suitable licence"), "licence");
      await a.wait(1400);
      await a.wheel(560, 16);
      await a.wait(400);
      await a.move(seen("Paper Design ↗"), "a library's creator");
      await a.wait(2200);
    },
  },
  {
    name: "ui-save",
    seconds: 9,
    async setup(page, base) {
      await page.goto(
        `${base}/director?example=genobi-teaser&workspace=editor`,
      );
      await ready(page);
      await hideAssets(page);
      await page.waitForTimeout(1200);
    },
    // Save the project and reuse the flow: the editable project and its JSON,
    // then the Director's templates.
    async run(a) {
      const { page } = a;
      await a.move(
        page.getByRole("button", { name: "Save JSON" }).first(),
        "save json",
      );
      await a.wait(1600);
      await a.click(
        page.getByRole("button", { name: "Back to Director" }).first(),
        "director",
      );
      await a.wait(1800);
      await a.move(
        page.getByRole("button", { name: /^Save editable project/ }).first(),
        "save editable project",
      );
      await a.wait(1600);
      await a.wheel(500, 14);
      await a.wait(1800);
    },
  },
];

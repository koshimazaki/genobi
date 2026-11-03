// Audio Reactive Drop, step 8: renders a bundle (drop-build-bundle.mts) through a running local
// studio's Director (Render MP4, every frame, locally, AAC audio) in headless Chrome and saves it.
//   DIRECTOR_URL=http://127.0.0.1:4317 node audio-reactive/edit/drop-render.mjs <bundle.zip> <out.mp4>
// The studio only needs the recipes the bundle uses; the zip carries the project and its media.
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
const mbps = process.env.DROP_MBPS ?? "24";
// The Director opens on a project before a bundle can replace it; any bundled example will do.
const opener = process.env.DROP_OPEN_EXAMPLE ?? "adaptive-reverb";
const [zip, out] = process.argv.slice(2);
if (!zip || !out)
  throw new Error("Usage: drop-render.mjs <bundle.zip> <out.mp4>");
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
  await page.addInitScript(() =>
    localStorage.setItem("genobi.startup-guide.v1", "seen"),
  );
  await page.goto(
    `${base}/director?example=${opener}&workspace=editor&exportMbps=${mbps}`,
  );
  const ready = page.getByText("Ready · local preview", { exact: true });
  await ready.waitFor({ timeout: 180000 });
  await page
    .locator('main.director > input[type="file"][accept=".zip,.json"]')
    .setInputFiles(zip);
  await page
    .getByText("Project · Audio Reactive Drop", { exact: true })
    .waitFor({ timeout: 180000 });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent?.startsWith("Render MP4") && !b.disabled,
    ),
  );
  await ready.waitFor({ timeout: 300000 });
  const started = Date.now();
  await page.getByRole("button", { name: "Render MP4" }).click();
  await page.getByText(/^Render ready · MP4/).waitFor({ timeout: 30 * 60000 });
  console.log(`rendered in ${Math.round((Date.now() - started) / 1000)} s`);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /^Download video/ }).click();
  await (await download).saveAs(out);
  console.log("saved", out);
  if (errors.length) console.warn("page errors:", errors.join(" | "));
} finally {
  await browser.close();
}

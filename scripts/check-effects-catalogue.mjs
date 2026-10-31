// Real Chromium checks of the production factories and DirectorRenderer.
// Uses original procedural pixels; no reference media, generation or service.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.EFFECTS_CHECK_URL ?? "http://127.0.0.1:4499";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const out = process.env.EFFECTS_CHECK_OUT ?? "/tmp/genobi-effects-check";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  channel: process.env.CHROME_BIN ? undefined : "chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-features=LocalNetworkAccessChecks"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 980 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === "/__effects_check")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><title>Effect renderer checks</title></head><body style="margin:24px;background:#15191b;color:#e9eadd;font:14px monospace"><h1>Production effect renderers</h1><main style="display:grid;grid-template-columns:1fr 1fr;gap:20px"></main></body></html>',
      });
    return route.continue();
  });
  await page.goto(`${base}/__effects_check`);
  const reports = await page.evaluate(async () => {
    const { catalogueEffects, catalogueEffectModules } =
      await import("/src/director/catalogue-effects.ts");
    const { libraries } = await import("/src/director/recipes.ts");
    const { FilterHost } = await import("/src/director/filter-host.ts");
    const { DirectorRenderer } = await import("/src/director/renderer.ts");
    const { validateFiles, digest } = await import("/src/director/bundle.ts");
    const { preloadBundledFonts } =
      await import("/src/director/font-registry.ts");
    await preloadBundledFonts();
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const canvas = (width, height) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      return c;
    };
    const paint = (c, variation = 0) => {
      const ctx = c.getContext("2d");
      const { width: w, height: h } = c;
      const gradient = ctx.createLinearGradient(0, h, w, 0);
      gradient.addColorStop(0, variation ? "#426b75" : "#152729");
      gradient.addColorStop(0.5, variation ? "#d8aa79" : "#9f6b61");
      gradient.addColorStop(1, variation ? "#6888a4" : "#e7dec2");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#203535";
      ctx.beginPath();
      ctx.arc(
        w * (variation ? 0.35 : 0.61),
        h * 0.52,
        Math.min(w, h) * 0.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#b3403a";
      ctx.fillRect(w * 0.3, h * 0.33, w * 0.1, h * 0.4);
      ctx.strokeStyle = "#eadfbc";
      ctx.lineWidth = Math.min(w, h) * 0.004;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.17, h * (0.18 + i * 0.08));
        ctx.lineTo(w * 0.85, h * (0.29 + i * 0.08));
        ctx.stroke();
      }
    };
    const pixels = (c) =>
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const hash = (c) => digest(new Uint8Array(pixels(c)));
    const results = [];
    for (const [width, height, fps] of [
      [640, 360, 24],
      [360, 640, 30],
      [513, 513, 60],
    ]) {
      for (const [id, recipe] of Object.entries(catalogueEffects)) {
        const module = catalogueEffectModules[id];
        const parameters = Object.fromEntries(
          Object.entries(module.parameterSchema.properties).map(
            ([key, value]) => [key, value.default],
          ),
        );
        const source = canvas(width, height);
        paint(source);
        const inputHash = await hash(source);
        const host = new FilterHost(source);
        const instance = await recipe.create({
          canvas: canvas(width, height),
          width,
          height,
          parameters,
          libraries,
          renderer: host.renderer,
        });
        const output = canvas(width, height);
        const draw = async (t, effect = instance) => {
          host.texture.needsUpdate = true;
          await effect.render({ timeSeconds: t, inputTexture: host.texture });
          const ctx = output.getContext("2d");
          ctx.clearRect(0, 0, width, height);
          if (recipe.mode === "overlay") {
            ctx.drawImage(source, 0, 0);
            ctx.drawImage(effect.output, 0, 0);
          } else ctx.drawImage(host.output(effect.output), 0, 0);
          return hash(output);
        };
        const frame = Math.round(fps * 1.25);
        const time = frame / fps;
        const direct = await draw(time);
        await draw(3.9);
        const earlier = await draw(0.05);
        check(
          (await draw(time)) === direct,
          `${id}: reverse seek changed pixels`,
        );
        check(earlier !== direct, `${id}: animation did not change`);
        const neutral = await recipe.create({
          canvas: canvas(width, height),
          width,
          height,
          parameters: { ...parameters, mix: 0 },
          libraries,
          renderer: host.renderer,
        });
        check(
          (await draw(time, neutral)) === inputHash,
          `${id}: mix zero changed the source`,
        );
        neutral.dispose();
        paint(source, 1);
        const replacement = await draw(time);
        check(
          replacement !== direct,
          `${id}: source replacement had no effect`,
        );
        paint(source);
        await draw(time);
        const file = new Uint8Array(
          await (
            await new Promise((resolve) => source.toBlob(resolve, "image/png"))
          ).arrayBuffer(),
        );
        const base = {
          id: "effect",
          name: id,
          moduleId: id,
          parameters,
          startFrame: 0,
          durationFrames: fps * 4,
          locked: false,
        };
        const visual = {
          opacity: 1,
          position: { x: 0, y: 0 },
          scale: 1,
          rotationDegrees: 0,
        };
        const project = {
          schemaVersion: "director.bundle.v1",
          id: "effects-browser-check",
          name: "Effect render check",
          revision: 1,
          composition: {
            width,
            height,
            fps,
            durationFrames: fps * 4,
            colorSpace: "srgb",
            alpha: "straight",
            background: "#000000",
          },
          assets: {
            source: {
              kind: "image",
              use: "production",
              origin: "uploaded",
              file: { path: "media/source.png", sha256: await digest(file) },
            },
          },
          modules: { [id]: module },
          layers: [
            {
              id: "source",
              name: "Source",
              kind: "image",
              assetId: "source",
              fit: "contain",
              startFrame: 0,
              durationFrames: fps * 4,
              locked: false,
              ...visual,
            },
            recipe.mode === "filter"
              ? { ...base, kind: "filter", input: "composite-below" }
              : { ...base, kind: "graphics", ...visual },
          ],
          generationPlans: [],
          generations: [],
        };
        const bundle = {
          project,
          files: new Map([
            ["media/source.png", file],
            [module.file.path, new TextEncoder().encode(recipe.source)],
          ]),
        };
        await validateFiles(bundle);
        const rendered = canvas(width, height);
        const director = await new DirectorRenderer(bundle, rendered).init();
        await director.render(frame);
        check(
          (await hash(rendered)) === direct,
          `${id}: catalogue preview differs from DirectorRenderer`,
        );
        await director.render(0);
        await director.render(frame);
        check(
          (await hash(rendered)) === direct,
          `${id}: DirectorRenderer reverse seek changed pixels`,
        );
        if (fps === 24) {
          const section = document.createElement("section");
          const title = document.createElement("h2");
          title.textContent = id.replace("effects-", "");
          const thumbnail = canvas(width, height);
          thumbnail.style.width = "100%";
          thumbnail.getContext("2d").drawImage(rendered, 0, 0);
          section.append(title, thumbnail);
          document.querySelector("main").append(section);
        }
        director.dispose();
        instance.dispose();
        host.dispose();
        results.push({
          id,
          width,
          height,
          fps,
          neutral: true,
          exactSeek: true,
          sourceReplacement: true,
          previewDirectorParity: true,
          hash: direct,
        });
      }
    }
    return results;
  });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/renderers.png`, fullPage: true });
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      checks: reports.length,
      result: "PASS",
      errors,
      output: out,
    }),
  );
} finally {
  await browser.close();
}

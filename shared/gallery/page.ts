import { findHouseTemplate, findMixTemplate } from "../templates/catalogue";
import { footageMadeWith } from "./badges";
import { directorLink, embedLink, galleryMedia, watchLink } from "./catalogue";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Only curated, bundled catalogue media is public. Never resolves session IDs. */
export function galleryPage(path: string, origin: string) {
  const match = /^\/(watch|embed)\/([a-z0-9-]+)\/?$/.exec(path);
  if (!match) return undefined;
  const template = findHouseTemplate(match[2]) ?? findMixTemplate(match[2]);
  const media = template && galleryMedia(template);
  if (!template || !media) return undefined;
  const embedded = match[1] === "embed";
  const absolute = (path: string) => escape(new URL(path, origin).href);
  const secure = new URL(origin).protocol === "https:";
  const player = playerSize(media);
  const title = escape(template.name);
  const note = media.demo
    ? `Preview footage${footageMadeWith(template) ? `, ${footageMadeWith(template)}` : ""}. This clip is not a generated result of the template.`
    : escape(template.description);
  const body = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Genobi</title>
<meta name="description" content="${note}">
<meta property="og:type" content="video.other"><meta property="og:site_name" content="Genobi">
<meta property="og:title" content="${title}"><meta property="og:description" content="${note}">
<meta property="og:url" content="${absolute(watchLink(template.id))}">
<meta property="og:image" content="${absolute(media.poster)}"><meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${media.width}"><meta property="og:image:height" content="${media.height}">
<meta property="og:image:alt" content="${title}: a frame of the preview">
<meta property="og:video" content="${absolute(media.video)}">${secure ? `<meta property="og:video:secure_url" content="${absolute(media.video)}">` : ""}
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="${media.width}"><meta property="og:video:height" content="${media.height}">
<meta name="twitter:card" content="player"><meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${note}"><meta name="twitter:image" content="${absolute(media.poster)}">
<meta name="twitter:player" content="${absolute(embedLink(template.id))}">
<meta name="twitter:player:width" content="${player.width}"><meta name="twitter:player:height" content="${player.height}">
<meta name="twitter:player:stream" content="${absolute(media.video)}"><meta name="twitter:player:stream:content_type" content="video/mp4">
<link rel="canonical" href="${absolute(watchLink(template.id))}">
<style>
*{box-sizing:border-box}body{margin:0;background:#101316;color:#e4e8ed;font:15px system-ui,sans-serif}
main{max-width:1100px;margin:${embedded ? "0 auto" : "5vh auto"};padding:${embedded ? "0" : "16px"}}
.player{border:1px solid #333a42;border-radius:8px;overflow:hidden}video{display:block;width:100%;max-height:${embedded ? "calc(100vh - 44px)" : "75vh"};background:#080a0c;object-fit:contain}
footer{height:42px;display:flex;align-items:center;gap:12px;padding:0 12px;background:#171a1e}
a{color:inherit;text-decoration:none}a:focus-visible{outline:2px solid #c0d672;outline-offset:3px}
.brand{font-weight:650;color:#c0d672}footer span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}footer>a:last-child{margin-left:auto}
p{color:#a4abb4;line-height:1.5}.action{display:inline-block;padding:10px 16px;border-radius:5px;background:#c0d672;color:#14180e}nav{display:flex;align-items:center;gap:20px}
</style></head><body><main><div class="player">
<video controls playsinline preload="metadata" poster="${escape(media.poster)}" src="${escape(media.video)}" aria-label="${title}"></video>
<footer><a class="brand" href="${absolute("/")}" target="_blank" rel="noopener">Genobi</a><span>${title}</span><a href="${absolute(watchLink(template.id))}" target="_blank" rel="noopener" aria-label="Open video in Genobi">Open ↗</a></footer></div>
${embedded ? "" : `<p>${note}</p><nav><a class="action" href="${absolute(directorLink(template.id))}">Make your own</a><a href="${escape(media.video)}" download>Download video</a></nav>`}
</main></body></html>`;
  return {
    body,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${embedded ? "*" : "'none'"}`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    },
  };
}

/** The embed's frame: the video at its own size over the 42 px footer and border. */
const playerSize = (media: { width: number; height: number }) => ({
  width: media.width,
  height: media.height + 44,
});

export function embedMarkup(id: string, origin: string) {
  const template = findHouseTemplate(id) ?? findMixTemplate(id);
  const media = template && galleryMedia(template);
  if (!media) throw new Error("Unknown template");
  const { width, height } = playerSize(media);
  return `<iframe src="${escape(new URL(embedLink(id), origin).href)}" title="Genobi video" width="${width}" height="${height}" style="max-width:100%;border:0" allow="fullscreen" allowfullscreen loading="lazy"></iframe>`;
}

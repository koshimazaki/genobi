/** A curated template without footage still has an honest, embeddable page. */
export function pendingPage(
  title: string,
  url: string,
  director: string,
  embedded: boolean,
) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Genobi</title><meta property="og:title" content="${title}">
<link rel="icon" href="/favicon.svg?v=genobi-011" type="image/svg+xml">
<link rel="icon" href="/favicon.ico?v=genobi-011" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=genobi-011">
<meta property="og:description" content="Preview coming soon">
<meta property="og:url" content="${url}"><link rel="canonical" href="${url}">
<style>body{margin:0;background:#101316;color:#e4e8ed;font:16px system-ui,sans-serif}main{padding:24px}a{color:#c0d672}</style>
</head><body><main><h1>${title}</h1><p>Preview coming soon</p>
<a href="${director}" target="_blank" rel="noopener">Make your own</a>
${embedded ? "" : `<p><a href="/">Genobi gallery</a></p>`}
</main></body></html>`;
}

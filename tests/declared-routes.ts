import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect } from "vitest";

/**
 * The routes the local server declares: `app.<method>("/api/…")` in
 * `server/app.ts`, and `router.<method>("…")` in each router mounted there,
 * with its mount path. A router may be a function (`app.use(p, fooRouter(…))`)
 * or a class's `router()` method (`app.use(p, instance.router(…))`).
 */
export function declaredRoutes() {
  const dir = path.resolve("server");
  const app = readFileSync(path.join(dir, "app.ts"), "utf8");
  // `mountPairings` (server/pairings.ts) mounts World's and Scrolls' routers.
  const pairings = readFileSync(path.join(dir, "pairings.ts"), "utf8");
  const mounts = new Map<string, string>();
  for (const m of `${app}\n${pairings}`.matchAll(
    /app\.use\(\s*"(\/api[^"]*)",\s*(?:await\s+)?(\w+)\(/g,
  ))
    mounts.set(m[2], m[1]);
  for (const m of app.matchAll(
    /app\.use\(\s*"(\/api[^"]*)",\s*(\w+)\.router\(/g,
  )) {
    const owner = new RegExp(`\\b${m[2]} = new (\\w+)\\(`).exec(app)?.[1];
    expect(owner, `${m[2]} is constructed in app.ts`).toBeTruthy();
    mounts.set(owner!, m[1]);
  }
  const routes = [
    ...app.matchAll(/\bapp\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g),
  ].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(path.join(dir, file), "utf8");
    const routers = [
      ...text.matchAll(/export (?:async )?(?:function|class) (\w+)\b/g),
    ]
      .map((m) => m[1])
      .filter((name) => mounts.has(name));
    if (!routers.length) continue;
    expect(routers, `${file} mounts one router`).toHaveLength(1);
    for (const m of text.matchAll(
      /\brouter\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g,
    ))
      routes.push(
        `${m[1].toUpperCase()} ${(mounts.get(routers[0]) + m[2]).replace(/\/$/, "")}`,
      );
  }
  return routes;
}

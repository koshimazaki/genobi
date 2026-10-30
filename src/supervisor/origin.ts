/** Only an explicitly selected HTTP loopback origin can supply local presence. */
export function supervisorOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

const KEY = "genobi.supervisor.origin";
/** Remember the person's opt-in in this tab, so a reload can reconnect. */
export function rememberedSupervisorOrigin() {
  try {
    const origin = supervisorOrigin(sessionStorage.getItem(KEY) ?? "");
    return origin !== window.location.origin ? origin : undefined;
  } catch {
    return undefined;
  }
}
export function rememberSupervisorOrigin(origin?: string) {
  try {
    if (origin) sessionStorage.setItem(KEY, origin);
    else sessionStorage.removeItem(KEY);
  } catch {
    // The active connection still works when storage is unavailable.
  }
}

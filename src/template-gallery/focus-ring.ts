/**
 * The drawer's Tab cycle. While the drawer is modal, Tab wraps inside it.
 * Once the header is live behind it (a spawn dialog asking, or a session the
 * status line sends the person to), the header's controls join the cycle
 * after the drawer's, so the bubble is one Tab past the drawer's last
 * control and the drawer one Tab past the header's last.
 */
export const FOCUSABLE =
  'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),video[controls],[tabindex]:not([tabindex="-1"])';

/** The header host, as the drawer's inert rule names it. */
export const HEADER_HOST = ".genobi-shell > .genobi-host";

const shown = (node: HTMLElement) =>
  node.getClientRects().length > 0 &&
  getComputedStyle(node).visibility !== "hidden" &&
  !node.closest("[inert]");

/** Focusable, shown controls in order: the drawer's, then the live header's. */
export function focusRing(drawer: HTMLElement, headerLive: boolean) {
  const within = (root: ParentNode | null) =>
    root
      ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown)
      : [];
  return [
    ...within(drawer),
    ...(headerLive ? within(document.querySelector(HEADER_HOST)) : []),
  ];
}

/**
 * The next control for a Tab from `active` in the ring, or undefined when
 * focus is outside it (then the browser's own order applies).
 */
export function nextInRing(
  ring: readonly HTMLElement[],
  active: Element | null,
  back: boolean,
) {
  const at = ring.indexOf(active as HTMLElement);
  if (at < 0 || !ring.length) return undefined;
  return ring[(at + (back ? -1 : 1) + ring.length) % ring.length];
}

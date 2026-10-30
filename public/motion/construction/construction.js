import { generate } from './ui-generation.js';

/** Decorative DOM construction. Cancels before interaction or layout changes. */
export function construct(element, options = {}) {
  if (!element?.isConnected) throw new Error('Construction target must be mounted.');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || document.hidden) return { cancel() {}, finished: Promise.resolve(element) };
  const { interactive = true, ...drawing } = options;
  const run = generate(element, { mode: 'skeleton-texts', duration: 3600, maxParts: 60, ...drawing });
  const stop = () => run.cancel();
  const visibility = () => { if (document.hidden) stop(); };
  const motion = () => { if (reduced.matches) stop(); };
  window.addEventListener('resize', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', motion);
  if (interactive) {
    element.addEventListener('pointerdown', stop, { capture: true });
    element.addEventListener('focusin', stop);
    window.addEventListener('scroll', stop, { capture: true, passive: true });
  }
  run.finished.finally(() => {
    window.removeEventListener('resize', stop);
    window.removeEventListener('pagehide', stop);
    document.removeEventListener('visibilitychange', visibility);
    reduced.removeEventListener('change', motion);
    element.removeEventListener('pointerdown', stop, { capture: true });
    element.removeEventListener('focusin', stop);
    window.removeEventListener('scroll', stop, { capture: true });
  });
  return run;
}

// An opt-in clock shared by the study and vendor renderer. Browser globals stay
// untouched so media decoding, controls and screenshot capture remain live.
let active = false, now = 0, serial = 0;
const frames = new Map(), timers = new Map();
export const performance = { now: () => active ? now : window.performance.now() };
export function requestAnimationFrame(fn) {
  if (!active) return window.requestAnimationFrame(fn);
  frames.set(++serial, fn); return serial;
}
export function cancelAnimationFrame(id) {
  if (!active) return window.cancelAnimationFrame(id);
  frames.delete(id);
}
export function setTimeout(fn, delay = 0) {
  if (!active) return window.setTimeout(fn, delay);
  timers.set(++serial, { fn, due: now + delay }); return serial;
}
export function clearTimeout(id) {
  if (!active) return window.clearTimeout(id);
  timers.delete(id);
}
export function installClock() {
  active = true; now = 0; frames.clear(); timers.clear();
  return { restore() { active = false; frames.clear(); timers.clear(); }, advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); }
    const pending = [...frames]; frames.clear();
    for (const [, fn] of pending) fn(now);
  } };
}

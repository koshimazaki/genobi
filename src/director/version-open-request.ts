/**
 * A request, from outside the Director, to open Make my version on one
 * template's project once its project is the open one (the Camera's Layout to
 * Motion card). It waits here until that project opens, so a Director that
 * already greeted the same project once still opens the panel again.
 */
let pending: string | undefined;
const EVENT = "genobi:version-open";

export function requestVersionOpen(templateId: string) {
  pending = templateId;
  window.dispatchEvent(new Event(EVENT));
}

/** True once, for the template the request named. */
export function takeVersionOpen(templateId: string | undefined) {
  if (!templateId || pending !== templateId) return false;
  pending = undefined;
  return true;
}

export function onVersionOpen(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Clipboard in secure browsers, then the selection-based browser fallback. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Denied clipboard access can still allow a copy from a selected field.
  }
  const field = document.createElement("textarea");
  const focused = document.activeElement as HTMLElement | null;
  field.value = value;
  field.setAttribute("aria-label", "Link to copy");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand?.("copy") ?? false;
  } catch {
    return false;
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
  }
}

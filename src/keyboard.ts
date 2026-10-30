/** Editing shortcuts must not eat typing, range, select, or dialog interactions. */
export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]',
    )
  );
}

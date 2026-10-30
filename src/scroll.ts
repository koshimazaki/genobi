/** Scroll options that honour reduced motion: smooth unless it is asked off. */
export const smoothScroll = (
  block: ScrollLogicalPosition,
): ScrollIntoViewOptions => ({
  block,
  behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth",
});

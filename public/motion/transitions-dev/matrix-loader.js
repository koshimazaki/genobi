// transitions.dev / Matrix dot loader: Jakub Antalik / Transitions.dev, free tier, under
// ./LICENSE.txt. Copied unchanged from skills/transitions-dev/31-matrix-loader.md
// (upstream commit e3aefb554d8f); this header is the only addition.
// Build 16 dots per loader and hand each a --d delay (ms) into the
// shared pulse cycle — the variant is just a delay table.
const CORNERS = [0, 3, 12, 15];
// Clockwise perimeter (corner-less ring), then centre cells.
const RING = [1, 2, 7, 11, 14, 13, 8, 4];
const INNER = [5, 6, 9, 10];
const TWINKLE = [7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4];

const cycle = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue("--matrix-cycle")
) || 1200;

document.querySelectorAll(".t-matrix").forEach((loader) => {
  const variant = loader.getAttribute("data-variant");
  const rounded = loader.getAttribute("data-rounded") === "true";
  for (let idx = 0; idx < 16; idx++) {
    const dot = document.createElement("i");
    const col = idx % 4;
    if (rounded && CORNERS.includes(idx)) {
      dot.className = "is-gap";
    } else if (variant === "scan") {
      dot.style.setProperty("--d", String(Math.round(col * (cycle / 10))));
    } else if (variant === "twinkle") {
      dot.style.setProperty("--d", String(Math.round(TWINKLE[idx] * (cycle / 16))));
    } else if (variant === "orbit") {
      const k = RING.indexOf(idx);
      if (k !== -1) {
        dot.style.setProperty("--d", String(Math.round(k * (cycle / 8))));
      } else {
        dot.style.animation = "none"; // centre holds steady under the ring
      }
    } else if (variant === "pulse") {
      const ring = INNER.includes(idx) ? 0 : 1;
      dot.style.setProperty("--d", String(Math.round(ring * (cycle * 0.16))));
    }
    loader.appendChild(dot);
  }
});

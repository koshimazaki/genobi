// Anime drives plain numbers; Canvas draws the transparent graphics surface.
export function createLayer({ canvas, width, height, parameters, libraries }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const values = { reveal: 0 };
  const animation = libraries.animejs.animate(values, {
    reveal: 1,
    duration: 800,
    ease: "outCubic",
    autoplay: false,
  });
  return {
    output: canvas,
    render({ timeSeconds }) {
      animation.seek(Math.min(800, timeSeconds * 1000), true);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = parameters.color;
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(
          24,
          height - 42 + i * 9,
          parameters.length * values.reveal * (1 - i * 0.2),
          4,
        );
      }
    },
    dispose() {
      animation.cancel();
    },
  };
}

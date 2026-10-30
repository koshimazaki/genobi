// Seekable typography and vector icon. No DOM capture or wall-clock animation.
export function createLayer({ canvas, width, height, parameters, libraries }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const state = { rise: 24, reveal: 0 };
  const animation = libraries.animejs.animate(state, {
    rise: 0,
    reveal: 1,
    duration: 700,
    ease: "outCubic",
    autoplay: false,
  });
  return {
    output: canvas,
    render({ timeSeconds }) {
      animation.seek(Math.min(700, timeSeconds * 1000), true);
      const beat =
        1 + 0.035 * Math.exp(-((timeSeconds * (parameters.bpm / 60)) % 1) * 8);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height * 0.74 + state.rise);
      ctx.scale(beat, beat);
      ctx.fillStyle = parameters.color;
      ctx.font = `600 ${parameters.size}px "Instrument Sans Variable", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        parameters.text.slice(
          0,
          Math.ceil(parameters.text.length * state.reveal),
        ),
        0,
        0,
      );
      ctx.strokeStyle = parameters.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, 14);
      ctx.lineTo(0, 22);
      ctx.lineTo(8, 14);
      ctx.stroke();
      ctx.restore();
    },
    dispose() {
      animation.cancel();
    },
  };
}

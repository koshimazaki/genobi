// Template typography: explicit time, measured line wrapping and a readable scrim.
export function wrapHeadline(ctx, text, width) {
  const lines = [];
  let line = "";
  for (const char of Array.from(text.replace(/\s+/g, " ").trim())) {
    if (line && ctx.measureText(line + char).width > width) {
      const space = line.lastIndexOf(" ");
      if (space > 0) {
        lines.push(line.slice(0, space));
        line = line.slice(space + 1) + char;
      } else {
        lines.push(line);
        line = char;
      }
    } else line += char;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  return {
    output: canvas,
    render({ timeSeconds }) {
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, height * 0.57, 0, height);
      gradient.addColorStop(0, "rgba(8,12,20,0)");
      gradient.addColorStop(1, "rgba(8,12,20,.94)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, height * 0.57, width, height * 0.43);
      let size = parameters.size,
        lines;
      do {
        ctx.font = `600 ${size}px "Instrument Sans Variable", sans-serif`;
        lines = wrapHeadline(ctx, parameters.text, width * 0.82);
        if (lines.length <= 3 || size <= 12) break;
        size -= 1;
      } while (size >= 12);
      const progress =
        1 - Math.pow(1 - Math.min(1, Math.max(0, timeSeconds) / 0.55), 3);
      ctx.save();
      ctx.globalAlpha = progress;
      ctx.translate(0, 16 * (1 - progress));
      ctx.fillStyle = parameters.color;
      ctx.textAlign = "left";
      const bottom = height * 0.87,
        leading = size * 1.13;
      lines.forEach((line, i) =>
        ctx.fillText(
          line,
          width * 0.09,
          bottom - (lines.length - 1 - i) * leading,
        ),
      );
      ctx.fillRect(width * 0.09, height * 0.92, width * 0.16, 3);
      ctx.restore();
    },
    dispose() {},
  };
}

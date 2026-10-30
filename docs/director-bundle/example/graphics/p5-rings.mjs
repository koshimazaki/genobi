// Example module, not installed into the application. Host injects pinned p5.
export async function createLayer({
  canvas,
  width,
  height,
  parameters,
  libraries,
}) {
  let localTime = 0;
  let sketch;
  await new Promise((resolve) => {
    sketch = new libraries.p5((p) => {
      p.setup = () => {
        p.pixelDensity(1);
        p.createCanvas(width, height, canvas);
        p.noLoop();
        resolve();
      };
      p.draw = () => {
        p.clear();
        p.noFill();
        p.stroke(parameters.color);
        p.strokeWeight(2);
        for (let i = 0; i < parameters.count; i += 1) {
          const phase = (localTime * 0.35 + i / parameters.count) % 1;
          p.circle(width / 2, height / 2, 12 + phase * height * 0.8);
        }
      };
    });
  });
  return {
    output: canvas,
    async render({ timeSeconds }) {
      localTime = timeSeconds;
      await sketch.redraw();
    },
    dispose() {
      sketch.remove();
    },
  };
}

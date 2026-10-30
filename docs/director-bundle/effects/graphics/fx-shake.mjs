// Camera shake: the composite below, moved by seeded smooth noise. The offset
// is a pure function of the layer's time, so a seek, a replay and an
// exact-frame export all land on the same picture.
const hash = (seed, n) => {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
// Value noise in -1..1, eased between whole steps so the move has no jumps.
const noise = (seed, x) => {
  const i = Math.floor(x),
    f = x - i,
    s = f * f * (3 - 2 * f);
  return 2 * (hash(seed, i) * (1 - s) + hash(seed, i + 1) * s) - 1;
};

export function createLayer({
  width,
  height,
  parameters,
  libraries,
  renderer,
}) {
  const T = libraries.threejs;
  const { frequency, seed, decay } = parameters;
  // One amplitude, held to a fifth of the shorter side, sets both the move
  // and the zoom: the picture moves at most `amplitude` pixels on screen, and
  // a zoom of 1 + 2 × amplitude / side keeps that move from showing an edge.
  const side = Math.min(width, height);
  const amplitude = Math.min(parameters.amplitude, 0.2 * side);
  const target = new T.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.colorSpace = T.NoColorSpace;
  const material = new T.ShaderMaterial({
    uniforms: {
      source: { value: null },
      offset: { value: new T.Vector2(0, 0) },
      zoom: { value: 1 + (2 * amplitude) / side },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D source; uniform vec2 offset; uniform float zoom;
   varying vec2 vUv;
   // The offset is applied before the zoom, so it is the move on screen.
   void main(){ gl_FragColor=texture2D(source,(vUv-.5-offset)/zoom+.5); }`,
    depthTest: false,
    depthWrite: false,
    blending: T.NoBlending,
    toneMapped: false,
  });
  const geometry = new T.PlaneGeometry(2, 2),
    scene = new T.Scene(),
    camera = new T.Camera();
  scene.add(new T.Mesh(geometry, material));
  return {
    output: target.texture,
    render({ timeSeconds, inputTexture }) {
      const t = Math.max(0, timeSeconds),
        x = t * frequency,
        size = amplitude * Math.exp(-decay * t);
      // Screen pixels to texture units; y is up in the texture, down on screen.
      material.uniforms.offset.value.set(
        (size * noise(seed * 2, x)) / width,
        (-size * noise(seed * 2 + 1, x)) / height,
      );
      material.uniforms.source.value = inputTexture;
      const prev = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(prev);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      target.dispose();
    },
  };
}

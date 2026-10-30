// Filter adapter: input and output are straight-alpha, sRGB-encoded values.
// Host supplies a shared Three renderer and an untagged input texture; neither
// this raw shader nor the texture performs a second color-space conversion.
export function createLayer({
  width,
  height,
  parameters,
  libraries,
  renderer,
}) {
  const T = libraries.threejs;
  const target = new T.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.colorSpace = T.NoColorSpace;
  const material = new T.ShaderMaterial({
    uniforms: {
      source: { value: null },
      localTime: { value: 0 },
      amount: { value: parameters.amount },
      levels: { value: parameters.levels },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D source;
      uniform float localTime, amount, levels;
      varying vec2 vUv;
      void main() {
        vec4 pixel = texture2D(source, vUv);
        vec2 cell = mod(floor(gl_FragCoord.xy) + floor(localTime * 4.), 2.);
        float threshold = cell.y < 1. ? (cell.x < 1. ? 0. : 2.)
                                       : (cell.x < 1. ? 3. : 1.);
        vec3 quantized = floor(clamp(pixel.rgb + (threshold / 4. - .375)
                                    / levels, 0., 1.) * levels + .5) / levels;
        gl_FragColor = vec4(mix(pixel.rgb, quantized, amount), pixel.a);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: T.NoBlending,
    toneMapped: false,
  });
  const geometry = new T.PlaneGeometry(2, 2);
  const scene = new T.Scene();
  scene.add(new T.Mesh(geometry, material));
  const camera = new T.Camera();
  return {
    output: target.texture,
    render({ timeSeconds, inputTexture }) {
      const previousTarget = renderer.getRenderTarget();
      material.uniforms.source.value = inputTexture;
      material.uniforms.localTime.value = timeSeconds;
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(previousTarget);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      target.dispose();
    },
  };
}

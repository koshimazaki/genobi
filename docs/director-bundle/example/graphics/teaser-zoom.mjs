// A camera move on the picture below: it eases from one window on the frame
// to another over `ease` seconds, then drifts on slowly. A window is its
// centre (x, y, as fractions of the frame) and a zoom (1 is the whole
// frame); it never leaves the frame. Chain moves by starting each layer
// where the last ended. Pure in time: the window is a function of the
// layer's time alone. Original shader.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// --ease-smooth-out, as the Signal look's other moves.
const ease = (t) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** The window at time t: centre and zoom, kept inside the frame. */
export function windowAt(p, t) {
  const k = ease(p.ease > 0 ? t / p.ease : 1);
  const after = Math.max(0, t - p.ease);
  const zoom = Math.max(
    1,
    (p.fromZoom + (p.zoom - p.fromZoom) * k) * (1 + p.drift * after),
  );
  const half = 0.5 / zoom;
  return {
    zoom,
    x: clamp(p.fromX + (p.x - p.fromX) * k, half, 1 - half),
    y: clamp(p.fromY + (p.y - p.fromY) * k, half, 1 - half),
  };
}

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
      view: { value: new T.Vector3(0.5, 0.5, 1) },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    // The texture's v runs up, the window's y runs down the frame.
    fragmentShader: `uniform sampler2D source; uniform vec3 view; varying vec2 vUv;
   void main(){
    vec2 c=vec2(view.x,1.-view.y);
    vec2 uv=c+(vUv-.5)/view.z;
    gl_FragColor=texture2D(source,clamp(uv,0.,1.));
   }`,
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
      const w = windowAt(parameters, Math.max(0, timeSeconds));
      material.uniforms.source.value = inputTexture;
      material.uniforms.view.value.set(w.x, w.y, w.zoom);
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

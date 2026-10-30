// A colour grade over the composite below: lift, gamma and gain, then
// contrast, saturation and a multiplied tint, mixed in by amount. It has no
// clock, so every frame is graded the same way in preview and export.
const rgb = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export function createLayer({
  width,
  height,
  parameters,
  libraries,
  renderer,
}) {
  const T = libraries.threejs;
  const p = parameters;
  const target = new T.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.colorSpace = T.NoColorSpace;
  const material = new T.ShaderMaterial({
    uniforms: {
      source: { value: null },
      lift: { value: p.lift },
      gamma: { value: p.gamma },
      gain: { value: p.gain },
      contrast: { value: p.contrast },
      saturation: { value: p.saturation },
      tint: { value: new T.Vector3(...rgb(p.tint)) },
      tintAmount: { value: p.tintAmount },
      amount: { value: p.amount },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D source;
   uniform float lift,gamma,gain,contrast,saturation,tintAmount,amount;
   uniform vec3 tint; varying vec2 vUv;
   void main(){
    vec4 original=texture2D(source,vUv);
    vec3 c=gain*(original.rgb+lift*(1.-original.rgb));
    c=pow(max(c,0.),vec3(1./gamma));
    c=(c-.5)*contrast+.5;
    c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,saturation);
    c=clamp(mix(c,c*tint,tintAmount),0.,1.);
    gl_FragColor=vec4(mix(original.rgb,c,amount),original.a);
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
    render({ inputTexture }) {
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

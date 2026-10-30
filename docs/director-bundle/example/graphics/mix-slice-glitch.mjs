// A brief slice glitch on a hit: the composite below splits into horizontal
// bands that jump sideways with an RGB split, decaying to the clean picture
// over `duration`. Bands and offsets come from a seeded hash of the band and
// the frame, never Math.random. Original shader.
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
      time: { value: 0 },
      amount: { value: parameters.amount },
      slices: { value: parameters.slices },
      seed: { value: parameters.seed },
      duration: { value: parameters.duration },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D source; uniform float time,amount,slices,seed,duration;
   varying vec2 vUv;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   void main(){
    float k=clamp(1.-time/duration,0.,1.)*amount;
    float band=floor(vUv.y*slices);
    float frame=floor(time*30.);
    float r=hash(vec2(band+seed,frame));
    float jump=step(.45,hash(vec2(band*1.7,frame+seed)))*(r-.5)*.16*k;
    vec2 uv=vec2(fract(vUv.x+jump),vUv.y);
    float split=.012*k;
    vec4 c=texture2D(source,uv);
    vec3 color=vec3(texture2D(source,uv+vec2(split,0.)).r,c.g,texture2D(source,uv-vec2(split,0.)).b);
    gl_FragColor=vec4(mix(texture2D(source,vUv).rgb,color,step(.001,k)),c.a);
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
      material.uniforms.source.value = inputTexture;
      material.uniforms.time.value = Math.max(0, timeSeconds);
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

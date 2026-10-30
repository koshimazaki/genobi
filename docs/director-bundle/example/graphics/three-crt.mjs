// Original CRT treatment: barrel curvature, scanlines, vignette and RGB split.
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
      resolution: { value: new T.Vector2(width, height) },
      amount: { value: parameters.amount },
      curvature: { value: parameters.curvature },
      rgb: { value: parameters.rgb },
      vignette: { value: parameters.vignette },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D source;
   uniform float time,amount,curvature,rgb,vignette;
   uniform vec2 resolution; varying vec2 vUv;
   void main(){
    vec2 p=vUv*2.-1.; vec2 uv=(p*(1.+curvature*dot(p,p)))*.5+.5;
    vec4 original=texture2D(source,vUv);
    if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) {gl_FragColor=vec4(original.rgb*(1.-amount),original.a);return;}
    float offset=rgb/resolution.x;
    vec4 samplePixel=texture2D(source,uv);
    vec3 color=vec3(texture2D(source,uv+vec2(offset,0.)).r,samplePixel.g,texture2D(source,uv-vec2(offset,0.)).b);
    float scan=.91+.09*sin(uv.y*resolution.y*3.14159265+time*2.);
    float edge=1.-vignette*smoothstep(.18,1.25,length(p));
    color*=scan*edge;
    gl_FragColor=vec4(mix(original.rgb,color,amount),original.a);
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
      material.uniforms.time.value = timeSeconds;
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

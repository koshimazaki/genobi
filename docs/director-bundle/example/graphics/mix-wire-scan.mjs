// A wireframe scan through the picture: a line sweeps down the composite
// below and, in its wake, the picture's edges (a Sobel pass on luminance)
// are drawn as a glowing wireframe over a darkened copy, fading back to the
// picture behind it. Original shader. Pure in time.
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
  const c = new T.Color(parameters.color);
  const material = new T.ShaderMaterial({
    uniforms: {
      source: { value: null },
      time: { value: 0 },
      texel: { value: new T.Vector2(1 / width, 1 / height) },
      tint: { value: new T.Vector3(c.r, c.g, c.b) },
      amount: { value: parameters.amount },
      sweep: { value: parameters.sweep },
      trail: { value: parameters.trail },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D source; uniform float time,amount,sweep,trail;
   uniform vec2 texel; uniform vec3 tint; varying vec2 vUv;
   float lum(vec2 o){vec3 c=texture2D(source,vUv+o*texel).rgb;return dot(c,vec3(.299,.587,.114));}
   void main(){
    vec4 original=texture2D(source,vUv);
    float gx=-lum(vec2(-1,1))-2.*lum(vec2(-1,0))-lum(vec2(-1,-1))+lum(vec2(1,1))+2.*lum(vec2(1,0))+lum(vec2(1,-1));
    float gy=-lum(vec2(-1,-1))-2.*lum(vec2(0,-1))-lum(vec2(1,-1))+lum(vec2(-1,1))+2.*lum(vec2(0,1))+lum(vec2(1,1));
    float edge=smoothstep(.18,.55,length(vec2(gx,gy)));
    float head=mod(time,sweep)/sweep*(1.+trail);
    float d=head-(1.-vUv.y);
    float wake=d>0.?clamp(1.-d/trail,0.,1.):0.;
    float line=exp(-abs(d)*240.);
    vec3 base=original.rgb*(1.-.6*wake*amount);
    vec3 color=base+tint*(edge*wake*1.4+line*.9)*amount;
    gl_FragColor=vec4(min(color,vec3(1.)),original.a);
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

// A surveillance treatment confined to a box: inside the rectangle (x, y,
// w, h as fractions of the frame from its top left, edges softened over
// `feather`) the composite below is posterized with an ordered dither on
// its brightness alone (`posterize` mixes it in, `levels` steps of
// luminance; each pixel keeps its own hue, so nothing shifts colour) and swept by a wireframe scan (`wire` mixes it in: a Sobel pass on
// luminance in a `color` glow behind a line that sweeps down every `sweep`
// seconds and fades over `trail`, as `wire-scan` does). Outside the box the
// picture passes through untouched. A copy of those two filters with a box,
// so they and every project pinned to their hashes stay as they are.
// Original shader. Pure in time.
export function createLayer({
  width,
  height,
  parameters: p,
  libraries,
  renderer,
}) {
  const T = libraries.threejs;
  const target = new T.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.colorSpace = T.NoColorSpace;
  const c = new T.Color(p.color);
  const material = new T.ShaderMaterial({
    uniforms: {
      source: { value: null },
      time: { value: 0 },
      texel: { value: new T.Vector2(1 / width, 1 / height) },
      box: { value: new T.Vector4(p.x, p.y, p.w, p.h) },
      feather: { value: p.feather },
      levels: { value: p.levels },
      posterize: { value: p.posterize },
      wire: { value: p.wire },
      tint: { value: new T.Vector3(c.r, c.g, c.b) },
      sweep: { value: p.sweep },
      trail: { value: p.trail },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D source; uniform float time,feather,levels,posterize,wire,sweep,trail;
   uniform vec2 texel; uniform vec4 box; uniform vec3 tint; varying vec2 vUv;
   float lum(vec2 o){vec3 c=texture2D(source,vUv+o*texel).rgb;return dot(c,vec3(.299,.587,.114));}
   void main(){
    vec4 original=texture2D(source,vUv);
    // The box, from the frame's top left; 1 inside, 0 outside, soft edges.
    vec2 q=vec2(vUv.x,1.-vUv.y);
    vec2 lo=box.xy, hi=box.xy+box.zw;
    float f=max(feather,1e-4);
    float mask=smoothstep(lo.x-f,lo.x+f,q.x)*(1.-smoothstep(hi.x-f,hi.x+f,q.x))
              *smoothstep(lo.y-f,lo.y+f,q.y)*(1.-smoothstep(hi.y-f,hi.y+f,q.y));
    // Ordered dither on luminance, as the dither filter steps it; the pixel
    // is scaled to the stepped brightness, so its hue stays its own.
    vec2 cell=mod(floor(gl_FragCoord.xy)+floor(time*4.),2.);
    float threshold=cell.y<1.?(cell.x<1.?0.:2.):(cell.x<1.?3.:1.);
    float l=max(dot(original.rgb,vec3(.299,.587,.114)),1e-3);
    float stepped=floor(clamp(l+(threshold/4.-.375)/levels,0.,1.)*levels+.5)/levels;
    vec3 quantized=min(original.rgb*(stepped/l),vec3(1.));
    vec3 color=mix(original.rgb,quantized,posterize);
    // The wireframe scan, as wire-scan draws it.
    float gx=-lum(vec2(-1,1))-2.*lum(vec2(-1,0))-lum(vec2(-1,-1))+lum(vec2(1,1))+2.*lum(vec2(1,0))+lum(vec2(1,-1));
    float gy=-lum(vec2(-1,-1))-2.*lum(vec2(0,-1))-lum(vec2(1,-1))+lum(vec2(-1,1))+2.*lum(vec2(0,1))+lum(vec2(1,1));
    float edge=smoothstep(.18,.55,length(vec2(gx,gy)));
    float head=mod(time,sweep)/sweep*(1.+trail);
    float d=head-(1.-vUv.y);
    float wake=d>0.?clamp(1.-d/trail,0.,1.):0.;
    float line=exp(-abs(d)*240.);
    color=min(color*(1.-.6*wake*wire)+tint*(edge*wake*1.4+line*.9)*wire,vec3(1.));
    gl_FragColor=vec4(mix(original.rgb,color,mask),original.a);
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

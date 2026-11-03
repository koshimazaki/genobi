// Original analytic lens/scan treatment. Readable HUD typography is a separate
// layer above this filter. There is no tracked camera, fluid solver or history.
const rgb = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

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
  const material = new T.ShaderMaterial({
    uniforms: {
      source: { value: null },
      resolution: { value: new T.Vector2(width, height) },
      amount: { value: p.mix },
      lines: { value: p.lines },
      distortion: { value: p.distortion },
      accent: { value: new T.Vector3(...rgb(p.accent)) },
      time: { value: 0 },
    },
    vertexShader:
      "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `
      uniform sampler2D source;
      uniform vec2 resolution;
      uniform vec3 accent;
      uniform float amount,lines,distortion,time;
      varying vec2 vUv;
      vec3 sampleSource(vec2 p){return texture2D(source,clamp(p,vec2(0.),vec2(1.))).rgb;}
      void main(){
        vec4 original=texture2D(source,vUv);
        if(amount<=0.){gl_FragColor=original;return;}
        vec2 q=vUv-.5;
        vec2 uv=.5+q*(1.+dot(q,q)*.18*distortion);
        float spread=(.2+pow(abs(q.x)*2.,2.)*1.2)*distortion/resolution.x;
        vec3 c=vec3(sampleSource(uv+vec2(spread,0.)).r,
          sampleSource(uv).g,sampleSource(uv-vec2(spread,0.)).b);
        float luma=dot(c,vec3(.2126,.7152,.0722));
        c=mix(c,luma*mix(vec3(1.),accent,.35),.2);
        float distance=abs(vUv.y-fract(time*.22));
        distance=min(distance,1.-distance);
        float scan=exp(-distance*distance*1600.);
        c+=scan*accent*.16;
        float pitch=max(2.,min(resolution.x,resolution.y)/135.);
        c*=1.-lines*.12*(.5+.5*cos(vUv.y*resolution.y*6.2831853/pitch));
        float vignette=smoothstep(.25,.8,length(q*vec2(1.,1.25)));
        c*=1.-vignette*.23*distortion;
        gl_FragColor=vec4(mix(original.rgb,clamp(c,0.,1.),amount),original.a);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: T.NoBlending,
    toneMapped: false,
  });
  const geometry = new T.PlaneGeometry(2, 2);
  const scene = new T.Scene();
  const camera = new T.Camera();
  scene.add(new T.Mesh(geometry, material));
  return {
    output: target.texture,
    render({ timeSeconds, inputTexture }) {
      material.uniforms.source.value = inputTexture;
      material.uniforms.time.value = Math.max(0, timeSeconds) * p.speed;
      const previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      target.dispose();
    },
  };
}

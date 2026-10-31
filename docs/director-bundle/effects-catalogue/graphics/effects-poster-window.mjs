// Original Genobi poster treatment. Every fragment samples its corresponding
// source region; the 3 × 3 window never repeats the whole image in its cells.
// The source is the current composite. Jitter is spatial, not a temporal delay.
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
      windowCenter: { value: new T.Vector2(p.windowX, 1 - p.windowY) },
      windowSize: { value: p.windowSize },
      levels: { value: p.levels },
      halftone: { value: p.halftone },
      jitter: { value: p.jitter },
      accent: { value: new T.Vector3(...rgb(p.accent)) },
      amount: { value: p.mix },
      time: { value: 0 },
    },
    vertexShader:
      "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `
      uniform sampler2D source;
      uniform vec2 resolution,windowCenter;
      uniform vec3 accent;
      uniform float windowSize,levels,halftone,jitter,amount,time;
      varying vec2 vUv;
      void main(){
        vec4 original=texture2D(source,vUv);
        if(amount<=0.){gl_FragColor=original;return;}
        float unit=min(resolution.x,resolution.y);
        vec2 size=vec2(1.55,1.)*unit*windowSize;
        size=min(size,resolution*.94);
        vec2 center=clamp(windowCenter*resolution,size*.5,resolution-size*.5);
        vec2 pixel=vUv*resolution;
        vec2 local=pixel-(center-size*.5);
        if(any(lessThan(local,vec2(0.)))||any(greaterThan(local,size))){
          gl_FragColor=original;return;
        }
        vec2 offset=vec2(sin(time*2.1),.65*sin(time*1.6+.4))*jitter*unit/180.;
        vec2 sampleUv=clamp((pixel-offset)/resolution,vec2(0.),vec2(1.));
        vec3 sourceColor=texture2D(source,sampleUv).rgb;
        float luminance=dot(sourceColor,vec3(.2126,.7152,.0722));
        float level=floor(clamp((luminance-.04)/.87,0.,1.)*levels+.5)/levels;
        float pitch=max(2.,unit/90.);
        vec2 dotCenter=mod(pixel,pitch)-pitch*.5;
        float radius=sqrt(1.-level)*pitch*.36;
        float ink=1.-smoothstep(max(0.,radius-.5),radius+.5,length(dotCenter));
        float shade=mix(level,mix(.88,.10,ink),halftone);
        shade=mix(shade,.075,1.-step(.01,level));
        shade=mix(shade,.93,step(.99,level));
        vec3 treated=vec3(shade,shade,max(0.,shade-.015));
        float redMask=step(sourceColor.g*1.35,sourceColor.r)
          *step(sourceColor.b*.8,sourceColor.r)*step(.23,luminance)
          *(1.-step(.3,local.x/size.x));
        treated=mix(treated,accent,redMask*.8);
        vec2 cell=size/3.;
        vec2 distanceToLine=min(mod(local,cell),cell-mod(local,cell));
        float edge=min(min(distanceToLine.x,distanceToLine.y),
          min(min(local.x,local.y),min(size.x-local.x,size.y-local.y)));
        float line=1.-smoothstep(.25,.9,edge);
        treated=mix(treated,vec3(.87,.89,.86),line*.7);
        gl_FragColor=vec4(mix(original.rgb,treated,amount),original.a);
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
      material.uniforms.time.value = Math.max(0, timeSeconds);
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

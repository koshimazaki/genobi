// Original image refraction/reflection, evaluated directly from composition
// time. It is neither physical fluid simulation nor a port of a reference site.
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
      aspect: { value: width / height },
      amount: { value: p.mix },
      ripple: { value: p.ripple },
      folds: { value: p.folds },
      time: { value: 0 },
    },
    vertexShader:
      "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `
      uniform sampler2D source;
      uniform float aspect,amount,ripple,folds,time;
      varying vec2 vUv;
      vec2 mirror(vec2 p){return 1.-abs(mod(p,2.)-1.);}
      void main(){
        vec4 original=texture2D(source,vUv);
        if(amount<=0.){gl_FragColor=original;return;}
        vec2 p=(vUv-.5)*vec2(aspect,1.);
        float radius=length(p);
        float angle=(radius>.00001?atan(p.y,p.x):0.)+time*.12;
        float sector=6.2831853/folds;
        angle=abs(mod(angle+sector*.5,sector)-sector*.5);
        vec2 folded=vec2(cos(angle),sin(angle))*radius;
        vec2 wave=vec2(sin(folded.y*11.+time)+sin(folded.x*6.-time*.6),
          cos(folded.x*9.-time*.8)+cos(folded.y*7.+time*.5));
        vec2 uv=mirror((folded+wave*.025*ripple)/vec2(aspect,1.)+.5);
        vec3 reflected=texture2D(source,uv).rgb;
        float sheen=.5+.5*sin(radius*29.-angle*5.+time*.8);
        reflected+=pow(sheen,18.)*vec3(.035,.065,.07)*ripple;
        gl_FragColor=vec4(mix(original.rgb,clamp(reflected,0.,1.),amount),original.a);
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

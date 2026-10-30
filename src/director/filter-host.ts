import * as T from "three";
export class FilterHost {
  renderer: T.WebGLRenderer;
  texture: T.CanvasTexture;
  private material: T.ShaderMaterial;
  private scene = new T.Scene();
  private geometry = new T.PlaneGeometry(2, 2);
  private camera = new T.Camera();
  constructor(input: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    });
    this.renderer.setSize(input.width, input.height, false);
    this.renderer.setPixelRatio(1);
    this.texture = new T.CanvasTexture(input);
    this.texture.colorSpace = T.NoColorSpace;
    this.material = new T.ShaderMaterial({
      uniforms: { source: { value: null } },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader:
        "uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=texture2D(source,vUv);}",
      depthTest: false,
      depthWrite: false,
      blending: T.NoBlending,
      toneMapped: false,
    });
    this.scene.add(new T.Mesh(this.geometry, this.material));
  }
  output(texture: T.Texture) {
    this.material.uniforms.source.value = texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }
  dispose() {
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

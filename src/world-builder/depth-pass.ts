import * as T from "three";

/** Linear depth between `near` and `far` metres from the camera, written as
 * greyscale (near white, far and empty background black). MeshDepthMaterial
 * keeps skinning, morphs and instancing; only its final colour is replaced.
 */
export function createDepthPass() {
  const near = { value: 0.1 },
    far = { value: 50 };
  const material = new T.MeshDepthMaterial({
    depthPacking: T.BasicDepthPacking,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.depthNear = near;
    shader.uniforms.depthFar = far;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "varying vec2 vHighPrecisionZW;",
        "varying vec2 vHighPrecisionZW;\nuniform float depthNear;\nuniform float depthFar;",
      )
      .replace(
        "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
        // gl_Position.w is the view-space distance along the camera axis.
        "gl_FragColor = vec4( vec3( 1.0 - clamp( ( vHighPrecisionZW[ 1 ] - depthNear ) / ( depthFar - depthNear ), 0.0, 1.0 ) ), 1.0 );",
      );
  };
  material.customProgramCacheKey = () => "director-linear-depth";
  const black = new T.Color("#000000");
  return {
    /** Render `scene` as depth, hiding helpers, then restore its state. */
    render(
      renderer: T.WebGLRenderer,
      scene: T.Scene,
      camera: T.Camera,
      range: { near: number; far: number },
      hidden: T.Object3D[],
    ) {
      near.value = range.near;
      far.value = range.far;
      const background = scene.background,
        visible = hidden.map((o) => o.visible);
      scene.background = black;
      scene.overrideMaterial = material;
      hidden.forEach((o) => (o.visible = false));
      try {
        renderer.render(scene, camera);
      } finally {
        scene.background = background;
        scene.overrideMaterial = null;
        hidden.forEach((o, i) => (o.visible = visible[i]));
      }
    },
    dispose: () => material.dispose(),
  };
}

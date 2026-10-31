import * as T from "three";

/** A native Three.js floor with the quiet, distance-faded grid treatment. */
export function createDarkGrid() {
  const floor = new T.Mesh(
    new T.PlaneGeometry(2000, 2000),
    new T.MeshBasicMaterial({ color: "#080b12", toneMapped: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.8;
  const shadow = new T.Mesh(
    new T.PlaneGeometry(2000, 2000),
    new T.ShadowMaterial({
      color: "#000000",
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.795;
  shadow.receiveShadow = true;
  const lines = new T.Mesh(
    new T.PlaneGeometry(2000, 2000),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        cellColor: { value: new T.Color("#394454") },
        sectionColor: { value: new T.Color("#586979") },
      },
      vertexShader: `
        varying vec3 worldPoint;
        void main() {
          worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPoint, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 cellColor;
        uniform vec3 sectionColor;
        varying vec3 worldPoint;
        float lineAt(float spacing, float thickness) {
          vec2 cell = worldPoint.xz / spacing;
          vec2 distanceToLine = abs(fract(cell - 0.5) - 0.5);
          vec2 width = max(fwidth(cell), vec2(0.0001));
          vec2 coverage = distanceToLine / width;
          return 1.0 - smoothstep(thickness, thickness + 0.65,
            min(coverage.x, coverage.y));
        }
        void main() {
          float minor = lineAt(1.0, 0.4);
          float major = lineAt(5.0, 0.7);
          float fade = 1.0 - smoothstep(10.0, 48.0,
            distance(worldPoint.xz, cameraPosition.xz));
          float alpha = max(minor * 0.38, major * 0.58) * fade * fade;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(mix(cellColor, sectionColor, major), alpha);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  lines.rotation.x = -Math.PI / 2;
  lines.position.y = -0.79;
  const group = new T.Group();
  group.add(floor, shadow, lines);
  group.visible = false;
  return { group, lines, shadow };
}

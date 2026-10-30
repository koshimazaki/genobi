/** Neuro shader extracted from Holodeck. See Holodeck-LICENSE.txt. */
export const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const fragmentShader = `
  precision mediump float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_pixelRatio;
  uniform vec4 u_colorFront;
  uniform vec4 u_colorMid;
  uniform vec4 u_colorBack;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_scale;
  uniform float u_intensity;
  uniform bool u_enableBloom;
  uniform float u_bloomIntensity;

  varying vec2 vUv;

  const float PI = 3.14159265358979323846264338327;
  const float PI2 = 6.28318530718;

  // Rotation function - fixed parameter
  mat2 rotate(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  // Convert equirectangular UV to 3D sphere direction
  vec3 uvToSphere(vec2 uv) {
    float theta = uv.y * PI;        // 0 to PI (vertical)
    float phi = uv.x * PI2;         // 0 to 2PI (horizontal)

    float x = sin(theta) * sin(phi);
    float y = cos(theta);
    float z = sin(theta) * cos(phi);

    return vec3(x, y, z);
  }

  // Convert 3D direction back to 2D for pattern sampling
  vec2 sphereToPattern(vec3 dir) {
    // Stereographic projection for smooth, conformal mapping
    float k = 1.0 / (1.0 + dir.y);
    return vec2(dir.x * k, dir.z * k);
  }

  float neuroShape(vec2 uv, float t) {
    vec2 sine_acc = vec2(0.);
    vec2 res = vec2(0.);
    float scale = 8.;

    for (int j = 0; j < 15; j++) {
      uv = rotate(1.) * uv;
      sine_acc = rotate(1.) * sine_acc;
      vec2 layer = uv * scale + float(j) + sine_acc - t;
      sine_acc += sin(layer);
      res += (0.5 + 0.5 * cos(layer)) / scale;
      scale *= 1.2;
    }

    return res.x + res.y;
  }

  void main() {
    // Get UV coordinates normalized to [0,1]
    vec2 uv = vUv;

    // Convert to spherical coordinates
    vec3 sphereDir = uvToSphere(uv);

    // Project sphere direction to 2D pattern space
    vec2 patternUV = sphereToPattern(sphereDir);

    // Scale the pattern appropriately
    patternUV *= u_scale;

    // Add time-based animation
    float t = 0.5 * u_time;

    // Generate the neuro pattern
    float noise = neuroShape(patternUV, t);

    // Apply brightness and contrast
    noise = (1.0 + u_brightness) * pow(noise, 2.0);
    noise = pow(noise, 0.7 + 6.0 * u_contrast);
    noise = min(1.4, noise);

    // Blend colors
    float blend = smoothstep(0.7, 1.4, noise);

    vec4 frontC = u_colorFront;
    frontC.rgb *= frontC.a;

    vec4 midC = u_colorMid;
    midC.rgb *= midC.a;

    vec4 blendFront = mix(midC, frontC, blend);

    float safeNoise = max(noise, 0.0);
    vec3 color = blendFront.rgb * safeNoise;
    float opacity = clamp(blendFront.a * safeNoise, 0.0, 1.0);

    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    color = color + bgColor * (1.0 - opacity);
    opacity = opacity + u_colorBack.a * (1.0 - opacity);

    // Edge blending for better seamlessness
    float edgeBlend = 1.0;
    float edgeWidth = 0.02;

    // Horizontal seam blending
    float xEdge = min(uv.x, 1.0 - uv.x);
    edgeBlend *= smoothstep(0.0, edgeWidth, xEdge);

    // Vertical pole blending
    float yEdge = min(uv.y, 1.0 - uv.y);
    edgeBlend *= smoothstep(0.0, edgeWidth * 2.0, yEdge);

    color *= edgeBlend;
    opacity *= edgeBlend;

    // Apply overall intensity
    color *= u_intensity;

    // Bloom enhancement for bright areas
    if (u_enableBloom) {
      vec3 luminance = vec3(0.299, 0.587, 0.114);
      float brightness = dot(color, luminance);

      if (brightness > 0.5) {
        color *= (1.0 + u_bloomIntensity * brightness);
      }
    }

    gl_FragColor = vec4(color, opacity);
  }
`;

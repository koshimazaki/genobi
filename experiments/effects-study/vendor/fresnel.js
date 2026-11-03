// Alien.js — MIT, Patrick Schroen, 2020–2026. See ALIEN-LICENSE.txt.
// Pinned source: alienkitty/alien.js @ 67172dde1fe260e582957ee4fecbcf5983552c8c
// src/shaders/modules/fresnel/fresnel.glsl.js — GLSL helper copied unchanged.
export default /* glsl */ `
float getFresnel(vec3 viewDir, vec3 worldNormal, float power) {
    return pow(1.0 - abs(dot(viewDir, worldNormal)), power);
}
`;

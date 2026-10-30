/** Captures own GPU resources even for MToon's texture getters/uniforms. */
import * as THREE from "three";

export function cloneMaterial(source: THREE.Material) {
  const copy = source.clone();
  const values = copy as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(copy))
    if (value instanceof THREE.Texture) values[key] = value.clone();
  if (copy instanceof THREE.ShaderMaterial)
    for (const uniform of Object.values(copy.uniforms))
      if (uniform.value instanceof THREE.Texture)
        uniform.value = uniform.value.clone();
  return copy;
}

export function disposeMaterial(material: THREE.Material) {
  const textures = new Set<THREE.Texture>();
  for (const value of Object.values(material))
    if (value instanceof THREE.Texture) textures.add(value);
  if (material instanceof THREE.ShaderMaterial)
    for (const uniform of Object.values(material.uniforms))
      if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
  for (const texture of textures) texture.dispose();
  material.dispose();
}

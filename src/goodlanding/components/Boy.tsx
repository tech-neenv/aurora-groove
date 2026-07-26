import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { HEX } from '../config/palette';
import { driver } from '../driver';

const BOY_URL = '/assets/models/boy.glb';
useGLTF.preload(BOY_URL);

// The boy — a REAL rigged, animated humanoid (Khronos CesiumMan, royalty-free),
// rendered as the brief's pure-black silhouette with a thin aurora rim light.
// We keep three's skinning intact (walk cycle deforms) by patching a standard
// material via onBeforeCompile: body stays black, a fresnel term adds the rim in
// the aurora colour. This satisfies Rule 1 (real asset, not hand-drawn) and the
// silhouette law at once.
export default function Boy() {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(BOY_URL);
  const { actions, names } = useAnimations(animations, group);

  // rim uniforms shared into the patched material
  const rim = useMemo(
    () => ({ uRim: { value: new THREE.Color(HEX.aurora1) }, uLevel: { value: 0 } }),
    [],
  );

  const boy = useMemo(() => {
    // NOTE: use the scene directly — cloning a SkinnedMesh doesn't rebind its
    // skeleton, so the walk clip would move bones without deforming the mesh
    // (the A-pose bug). Single instance, so mutating the cached scene is fine.
    const root = scene;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 1,
        metalness: 0,
        emissive: new THREE.Color(0x000000),
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uRim = rim.uRim;
        shader.uniforms.uLevel = rim.uLevel;
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform vec3 uRim; uniform float uLevel; varying vec3 vWorldNormal; varying vec3 vWorldPos;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
             vec3 V = normalize(cameraPosition - vWorldPos);
             float fres = pow(1.0 - clamp(dot(normalize(vWorldNormal), V), 0.0, 1.0), 2.4);
             totalEmissiveRadiance += uRim * fres * (0.8 + uLevel * 1.4);`,
          );
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
             varying vec3 vWorldNormal; varying vec3 vWorldPos;`,
          )
          .replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
             vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
             vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
          );
      };
      m.material = mat;
    });
    return root;
  }, [scene, rim]);

  useEffect(() => {
    // CesiumMan's clip is unnamed, so names[0] is undefined — grab the first
    // action by value instead and play it (the walk cycle).
    const a = actions[names[0] as string] ?? Object.values(actions)[0];
    if (!a) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    a.timeScale = 0.9;
  }, [actions, names]);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    rim.uLevel.value = THREE.MathUtils.lerp(rim.uLevel.value, driver.level, 0.15);
    (rim.uRim.value as THREE.Color).lerpColors(
      new THREE.Color(HEX.aurora1),
      new THREE.Color(HEX.aurora2),
      THREE.MathUtils.smoothstep(driver.progress, 0.1, 0.7),
    );
    // face into the night (away from camera) with a subtle wind sway
    g.rotation.y = Math.PI + Math.sin(state.clock.elapsedTime * 0.6) * 0.05;
  });

  // CesiumMan is Y-up and already upright; outer group faces (useFrame) + places.
  return (
    <group ref={group} position={[0.3, -0.35, -2.2]} scale={0.62}>
      <primitive object={boy} />
    </group>
  );
}

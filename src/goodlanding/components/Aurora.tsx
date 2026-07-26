import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { auroraVert, auroraFrag } from '../shaders/aurora';
import { HEX } from '../config/palette';
import { driver } from '../driver';

// The sky-as-instrument. A large curved plane high in the scene running the
// aurora shader; its amplitude tracks the live song and magenta earns in at the
// climax. One light source in this world (brief), so it is additively blended.
export default function Aurora() {
  const mat = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0 },
      uClimax: { value: 0 },
      uC1: { value: new THREE.Color(HEX.aurora1) },
      uC2: { value: new THREE.Color(HEX.aurora2) },
      uC3: { value: new THREE.Color(HEX.aurora3) },
    }),
    [],
  );

  useFrame((_, dt) => {
    const u = uniforms;
    u.uTime.value += dt;
    // ribbon ignites from Ch2 (~0.11) onward; before that the sky is silent-dark
    const wake = THREE.MathUtils.smoothstep(driver.progress, 0.08, 0.16);
    u.uAmp.value = THREE.MathUtils.lerp(u.uAmp.value, (0.15 + driver.level * 1.1) * wake, 0.12);
    u.uClimax.value = THREE.MathUtils.smoothstep(driver.progress, 0.82, 0.95);
  });

  return (
    <group>
      {/* main curtain arcing across the sky ahead */}
      <mesh position={[0, 11, -34]} rotation={[Math.PI * 0.06, 0, 0]}>
        <planeGeometry args={[130, 46, 1, 1]} />
        <shaderMaterial
          ref={mat}
          vertexShader={auroraVert}
          fragmentShader={auroraFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* second, closer band for depth/parallax */}
      <mesh position={[-6, 8, -20]} rotation={[Math.PI * 0.1, 0.15, 0.08]}>
        <planeGeometry args={[70, 30, 1, 1]} />
        <shaderMaterial
          vertexShader={auroraVert}
          fragmentShader={auroraFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

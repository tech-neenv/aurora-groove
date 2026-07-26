import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { HEX } from '../config/palette';
import { driver } from '../driver';

// Snow plain — REAL PBR snow (ambientCG Snow006, CC0): color + normal + rough +
// AO + displacement on a high-res plane. Lit almost entirely by the aurora/HDRI;
// fog dissolves the horizon into --void.
export default function Terrain() {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const [color, normal, rough, ao, disp] = useTexture([
    '/assets/textures/snow/snow_color.jpg',
    '/assets/textures/snow/snow_normal.jpg',
    '/assets/textures/snow/snow_rough.jpg',
    '/assets/textures/snow/snow_ao.jpg',
    '/assets/textures/snow/snow_disp.jpg',
  ]);

  useMemo(() => {
    [color, normal, rough, ao, disp].forEach((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(18, 30);
      t.anisotropy = 8;
    });
    color.colorSpace = THREE.SRGBColorSpace;
  }, [color, normal, rough, ao, disp]);

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(160, 260, 200, 260);
    g.rotateX(-Math.PI / 2);
    // large-scale dunes (displacement map adds the fine snow detail on top)
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h =
        Math.sin(x * 0.05) * 0.6 +
        Math.cos(z * 0.04 + x * 0.02) * 0.7 +
        Math.sin((x + z) * 0.1) * 0.28;
      pos.setY(i, h - 0.7);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  useFrame(() => {
    if (mat.current) mat.current.emissiveIntensity = 0.05 + driver.level * 0.14;
  });

  return (
    <mesh geometry={geo} receiveShadow position={[0, 0, -50]}>
      <meshStandardMaterial
        ref={mat}
        map={color}
        normalMap={normal}
        roughnessMap={rough}
        aoMap={ao}
        displacementMap={disp}
        displacementScale={0.35}
        emissive={HEX.aurora2}
        emissiveIntensity={0.06}
        roughness={1}
        metalness={0}
        normalScale={new THREE.Vector2(0.7, 0.7)}
      />
    </mesh>
  );
}

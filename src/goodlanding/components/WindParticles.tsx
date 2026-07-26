import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HEX } from '../config/palette';

// Blowing snow / wind — near-field drifting points for depth (brief self-critique
// checklist: "near particles / mid subject / far glow"). Count halves on mobile.
export default function WindParticles({ count = 900 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const n = isMobile ? (count / 2) | 0 : count;

  const { geo, speeds } = useMemo(() => {
    const positions = new Float32Array(n * 3);
    const speeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 14;
      positions[i * 3 + 2] = -Math.random() * 40 + 4;
      speeds[i] = 0.5 + Math.random() * 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geo, speeds };
  }, [n]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      // wind blows +x and gently down, wraps around
      let x = pos.getX(i) + speeds[i] * dt * 6;
      let y = pos.getY(i) - speeds[i] * dt * 0.6;
      if (x > 30) x = -30;
      if (y < 0) y = 14;
      pos.setX(i, x);
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={HEX.snow}
        size={0.06}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

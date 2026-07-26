import * as THREE from 'three';

// Keyframed camera rig (brief Section 7). Camera lerps along these as scroll
// progress advances. Slow dolly + subtle drift always beats a static camera.
// Positions are in a single continuous world laid out along -Z (walking into
// the night). Tuned further at M1/M4.

export interface CamKey {
  chapter: number; // 1-based, for readability
  t: number; // global scroll progress 0..1 at this key
  position: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
}

export const CAMERA_KEYS: CamKey[] = [
  { chapter: 1, t: 0.0, position: [0, 1.6, 8], lookAt: [0, 1.4, 0], fov: 42 },
  { chapter: 2, t: 0.12, position: [1.5, 1.8, 2], lookAt: [-1, 3, -8], fov: 46 },
  { chapter: 3, t: 0.24, position: [0, 1.2, 3], lookAt: [0, 0.6, -2], fov: 38 }, // kneel/device close
  { chapter: 4, t: 0.4, position: [-2, 1.5, 4], lookAt: [0, 1, -3], fov: 44 }, // ice cave
  { chapter: 5, t: 0.52, position: [0, 1.0, 6], lookAt: [0, 0.2, -6], fov: 50 }, // lake, low
  { chapter: 6, t: 0.64, position: [0, 2.4, 5], lookAt: [0, 5, -6], fov: 52 }, // look up, strings
  { chapter: 7, t: 0.76, position: [2, 1.6, 3], lookAt: [-2, 1.6, -6], fov: 46 }, // canyon
  { chapter: 8, t: 0.88, position: [0, 3.5, 7], lookAt: [0, 3, -4], fov: 56 }, // summit wide
  { chapter: 9, t: 0.99, position: [0, 1.2, 1.2], lookAt: [0, 1.1, -4], fov: 30 }, // dolly INTO device
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Sample camera state at global progress p (0..1). Mutates the passed camera.
export function sampleCamera(p: number, cam: THREE.PerspectiveCamera): void {
  const keys = CAMERA_KEYS;
  let i = 0;
  while (i < keys.length - 1 && p > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = Math.max(1e-6, b.t - a.t);
  const lt = THREE.MathUtils.clamp((p - a.t) / span, 0, 1);
  const e = lt < 0.5 ? 2 * lt * lt : 1 - Math.pow(-2 * lt + 2, 2) / 2; // easeInOut

  cam.position.set(
    THREE.MathUtils.lerp(a.position[0], b.position[0], e),
    THREE.MathUtils.lerp(a.position[1], b.position[1], e),
    THREE.MathUtils.lerp(a.position[2], b.position[2], e),
  );
  _a.set(...a.lookAt);
  _b.set(...b.lookAt);
  _a.lerp(_b, e);
  cam.lookAt(_a);
  cam.fov = THREE.MathUtils.lerp(a.fov, b.fov, e);
  cam.updateProjectionMatrix();
}

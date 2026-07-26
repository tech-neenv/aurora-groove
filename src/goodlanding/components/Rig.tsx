import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleCamera } from '../config/cameraScript';
import { driver } from '../driver';

// Camera rig: lerps the perspective camera along cameraScript keyframes by scroll
// progress, plus a subtle mouse-parallax drift (brief: slow dolly + drift always
// beats static). Runs after scene updates so lookAt wins.
export default function Rig() {
  const { camera } = useThree();

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    sampleCamera(driver.progress, cam);
    // parallax drift layered on top of the scripted position
    cam.position.x += driver.mouse.x * 0.25;
    cam.position.y += -driver.mouse.y * 0.15;
  });

  return null;
}

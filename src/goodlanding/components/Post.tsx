import {
  EffectComposer,
  Bloom,
  Noise,
  Vignette,
  ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

// The cinematography layer (brief Rule 2: no raw three.js look ever ships).
// ACES tone mapping is set on the renderer (gl prop). Chain: bloom (low
// threshold, soft) → film grain (subtle) → vignette → ~0.5px chromatic
// aberration at edges. DepthOfField reserved for Ch3 + Ch9 only (added later).
export default function Post() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.9}
        luminanceThreshold={0.15}
        luminanceSmoothing={0.5}
        mipmapBlur
        radius={0.7}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={new THREE.Vector2(0.0006, 0.0006)}
        radialModulation
        modulationOffset={0.35}
      />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.22} />
      <Vignette eskil={false} offset={0.28} darkness={0.85} />
    </EffectComposer>
  );
}

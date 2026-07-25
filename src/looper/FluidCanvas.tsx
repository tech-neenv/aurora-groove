import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { looper } from './looper';

// A serene, living background — a domain-warped noise field rendered on a
// full-screen shader plane. Flows like ink in water / silk in light; breathes
// with the loop and warms toward whatever you're playing. Rendered at reduced
// internal resolution (it's soft by design) so the GPU stays calm.

const FRAG = /* glsl */`
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uLevel; uniform vec3 uHue; uniform vec2 uMouse;

float hash(vec2 p){ p = fract(p*vec2(123.34, 345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.)), c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float v=0.0,a=0.55; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  float aspect = uRes.x/uRes.y;
  vec2 p = vec2(uv.x*aspect, uv.y);
  float t = uTime * 0.04;                            // slow, glacial drift

  // deep violet-dark night — the dominant mood; aurora is only a faint flavour
  vec3 col = mix(vec3(0.028,0.020,0.052), vec3(0.006,0.006,0.018), uv.y);

  // aurora borealis — a whisper of it, mostly dissolved into the violet dark
  float aur = 0.0; vec3 aColor = vec3(0.0);
  for(int i=0;i<3;i++){
    float fi = float(i);
    float wave = fbm(vec2(p.x*1.1 + t*(0.7+0.25*fi) + fi*7.0, t*0.12));
    float base = 0.42 + 0.15*fi + wave*0.15;         // wavy baseline height of the curtain
    float d = uv.y - base;
    float glow = smoothstep(-0.06, 0.01, d) * exp(-max(d,0.0)*5.5);   // bright at base, fades up
    float streak = fbm(vec2(p.x*7.0 + t*0.6 + fi*3.0, uv.y*3.2 - t*0.7));
    glow *= 0.45 + 0.85*streak*streak;               // vertical filaments
    vec3 c = mix(vec3(0.16,0.62,0.46), vec3(0.30,0.42,0.80), fi*0.5); // green → teal
    c = mix(c, uHue, 0.55);                          // pulled strongly toward violet
    aur += glow; aColor += c*glow;
  }
  aColor /= max(aur, 0.0001);
  col += aColor * aur * (0.20 + uLevel*0.22);        // damp — just a flavour

  float vig = smoothstep(1.3, 0.4, length(uv-0.5));
  col *= 0.72 + 0.28*vig;
  col += (hash(uv*uTime)-0.5)*0.006;                 // whisper of grain, kills banding
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = /* glsl */`void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export function FluidCanvas({ hue }: { hue: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef(hue);
  hueRef.current = hue;

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
    const scale = 0.6;   // internal render scale — background is soft, save the GPU
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const scene = new THREE.Scene();
    const cam = new THREE.Camera();
    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uHue: { value: new THREE.Vector3(...hexToRgb(hue)) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    scene.add(mesh);

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setPixelRatio(dpr * scale);
      renderer.setSize(w, h, false);
      uniforms.uRes.value.set(w * dpr * scale, h * dpr * scale);
    };
    resize(); window.addEventListener('resize', resize);
    const onMove = (e: PointerEvent) => { uniforms.uMouse.value.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight); };
    window.addEventListener('pointermove', onMove, { passive: true });

    let raf = 0, lvl = 0; const start = performance.now();
    const frame = () => {
      uniforms.uTime.value = (performance.now() - start) / 1000;
      lvl += (Math.min(1, looper.level * 6) - lvl) * 0.08;   // smoothed audio energy
      uniforms.uLevel.value = lvl;
      const [r, g, b] = hexToRgb(hueRef.current);
      const uh = uniforms.uHue.value; uh.x += (r - uh.x) * 0.05; uh.y += (g - uh.y) * 0.05; uh.z += (b - uh.z) * 0.05;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      mesh.geometry.dispose(); mat.dispose(); renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} className="sr-fluid" aria-hidden="true" />;
}

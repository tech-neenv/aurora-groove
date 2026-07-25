import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { scroll } from './scroll';
import { scrollSong } from './scrollSong';

// The full-page cinematic backdrop, hand-written in three.js (no R3F — matches
// the studio's FluidCanvas, sidesteps version conflicts with three 0.185).
//
// A camera flies down a corridor as you scroll. Along the way: a dive-through
// PARTICLE aurora field, translucent AURORA RIBBONS, an FFT WAVEFORM TERRAIN
// that ripples to the live song, a day→neon COLOUR ARC, and a soft FINALE glow.
// Deliberately restrained — a dark, living backdrop the content reads cleanly
// over (a fixed scrim in CSS guarantees legibility). Reads the `scroll`
// singleton, so zero React re-renders.

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// day → neon colour arc (clear colour / fog), sampled by scroll progress
const ARC = [
  new THREE.Color('#070510'), // 0.0  deep indigo night
  new THREE.Color('#08171f'), // 0.33 teal dawn
  new THREE.Color('#0b1030'), // 0.66 electric blue
  new THREE.Color('#1c0824'), // 1.0  magenta neon night
];
function arcColor(p: number, out: THREE.Color) {
  const s = Math.min(0.999, Math.max(0, p)) * (ARC.length - 1);
  const i = Math.floor(s);
  return out.copy(ARC[i]).lerp(ARC[i + 1] ?? ARC[i], s - i);
}

const NOISE = /* glsl */ `
  vec3 hash3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
    return -1.0+2.0*fract(sin(p)*43758.5453123); }
  float vnoise(vec3 x){ vec3 p=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
    float n=0.0;
    for(int i=0;i<2;i++)for(int j=0;j<2;j++)for(int k=0;k<2;k++){
      vec3 o=vec3(float(i),float(j),float(k));
      n+=(1.0-abs(f.x-o.x))*(1.0-abs(f.y-o.y))*(1.0-abs(f.z-o.z))*dot(hash3(p+o),f-o);
    } return 0.5+0.5*n; }
  float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5;} return s; }
`;

export default function CinemaScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const small = window.innerWidth < 720;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(ARC[0], 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(ARC[0].clone(), 0.036);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(0, 0.4, 7);

    // ── PARTICLES ─────────────────────────────────────────────────────────────
    const COUNT = small ? 1200 : 2600;
    const pg = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 10;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * 6.5;
      pos[i * 3 + 2] = -50 * Math.random() + 6;
      seed[i] = Math.random();
    }
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uLevel: { value: 0 }, uBloom: { value: 0 }, uPr: { value: renderer.getPixelRatio() },
        uColA: { value: new THREE.Color('#3fe0a6') }, uColB: { value: new THREE.Color('#9b8cff') }, uColC: { value: new THREE.Color('#49a6ea') },
      },
      vertexShader: /* glsl */ `
        uniform float uTime,uLevel,uPr,uBloom; attribute float aSeed;
        varying float vT; varying float vD;
        void main(){
          vec3 p=position;
          p.x+=sin(uTime*0.3+aSeed*6.28)*0.5;
          p.y+=cos(uTime*0.24+aSeed*7.0)*0.4;
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          vD=-mv.z;
          float tw=0.55+0.45*sin(uTime*2.0+aSeed*30.0);
          vT=tw;
          gl_Position=projectionMatrix*mv;
          float size=(3.5+aSeed*7.0)*(1.0+uBloom*0.8);
          gl_PointSize=size*uPr*(300.0/max(vD,0.1))*(0.5+uLevel*0.7)*tw;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float; uniform vec3 uColA,uColB,uColC; uniform float uLevel,uBloom;
        varying float vT; varying float vD;
        void main(){
          vec2 c=gl_PointCoord-0.5; float d=length(c);
          float a=smoothstep(0.5,0.06,d);
          vec3 col=mix(uColA,uColB,vT); col=mix(col,uColC,smoothstep(10.0,40.0,vD)*0.6);
          col*=(0.5+uLevel*0.7+uBloom*0.5);
          gl_FragColor=vec4(col,a*(0.42+uBloom*0.25));
        }`,
    });
    const points = new THREE.Points(pg, pMat);
    scene.add(points);

    // ── AURORA RIBBONS (translucent, low-key) ─────────────────────────────────
    const ribbonMat = (hue: number) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uArc: { value: 0 }, uHue: { value: hue } },
      vertexShader: /* glsl */ `
        uniform float uTime,uLevel; varying vec2 vUv; ${NOISE}
        void main(){ vUv=uv; vec3 p=position;
          float w=fbm(vec3(uv.x*3.0, uv.y*2.0, uTime*0.25));
          p.y+=(w-0.5)*(1.8+uLevel*1.4);
          p.z+=sin(uv.x*8.0+uTime*0.6)*0.6;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);} `,
      fragmentShader: /* glsl */ `
        precision highp float; uniform float uTime,uLevel,uArc,uHue; varying vec2 vUv; ${NOISE}
        vec3 pal(float t){
          vec3 green=vec3(0.25,0.88,0.65), blue=vec3(0.29,0.65,0.92), purp=vec3(0.61,0.55,1.0), mag=vec3(1.0,0.44,0.68);
          vec3 c=mix(green,blue,smoothstep(0.0,0.5,t)); c=mix(c,purp,smoothstep(0.4,0.8,t)); c=mix(c,mag,smoothstep(0.75,1.0,t)*uArc);
          return c; }
        void main(){
          float band=fbm(vec3(vUv.x*4.0+uHue, vUv.y*3.0-uTime*0.2, uTime*0.15));
          float vert=smoothstep(0.0,0.4,vUv.y)*smoothstep(1.0,0.55,vUv.y);
          float glow=vert*(0.25+band*0.7)*(0.45+uLevel*0.7);
          vec3 col=pal(fract(vUv.x*0.8+band*0.4+uArc*0.3));
          float a=glow*smoothstep(0.0,0.18,vUv.x)*smoothstep(1.0,0.82,vUv.x);
          gl_FragColor=vec4(col*(0.9+uLevel*0.6),a*0.3);} `,
    });
    const ribbons: THREE.Mesh[] = [];
    const ribGeo = new THREE.PlaneGeometry(46, 8, 120, 20);
    [[-7, 0.0, 1.8], [-18, 0.4, -1.2], [-30, 0.7, 2.4]].forEach(([z, hue, y]) => {
      const m = new THREE.Mesh(ribGeo, ribbonMat(hue));
      m.position.set(0, y, z); m.rotation.z = (hue - 0.35) * 0.35;
      ribbons.push(m); scene.add(m);
    });

    // ── FFT WAVEFORM TERRAIN ──────────────────────────────────────────────────
    const FBIN = 128;
    const fftData = new Uint8Array(FBIN);
    const fftTex = new THREE.DataTexture(fftData, FBIN, 1, THREE.RedFormat, THREE.UnsignedByteType);
    fftTex.needsUpdate = true;
    const terrainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uFft: { value: fftTex }, uLevel: { value: 0 }, uBass: { value: 0 },
        uArc: { value: 0 }, uVis: { value: 0 }, uColA: { value: new THREE.Color('#3fe0a6') }, uColB: { value: new THREE.Color('#b48cff') },
      },
      vertexShader: /* glsl */ `
        uniform sampler2D uFft; uniform float uTime,uLevel,uBass; varying vec2 vUv; varying float vH; ${NOISE}
        void main(){ vUv=uv;
          float f=texture2D(uFft, vec2(abs(uv.x-0.5)*2.0,0.5)).r;
          float ridge=fbm(vec3(uv.x*5.0, uv.y*5.0-uTime*0.3, 0.0));
          float h=f*(4.5+uBass*4.0)+ridge*1.3;
          h*=smoothstep(0.0,0.15,uv.y);
          vH=h;
          vec3 p=position; p.z+=h;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);} `,
      fragmentShader: /* glsl */ `
        precision highp float; uniform float uArc,uVis,uLevel; uniform vec3 uColA,uColB; varying vec2 vUv; varying float vH;
        void main(){
          vec2 gr=abs(fract(vUv*vec2(60.0,40.0))-0.5)/fwidth(vUv*vec2(60.0,40.0));
          float line=1.0-min(min(gr.x,gr.y),1.0);
          vec3 col=mix(uColA,uColB,clamp(vH*0.16+uArc,0.0,1.0));
          float depth=smoothstep(0.0,0.3,vUv.y)*smoothstep(1.0,0.6,vUv.y);
          float a=(line*0.7+vH*0.04)*depth*uVis;
          gl_FragColor=vec4(col*(0.9+vH*0.12+uLevel*0.5),a);} `,
    });
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(80, 60, 128, 80), terrainMat);
    terrain.rotation.x = -Math.PI / 2; terrain.position.set(0, -6, -20);
    scene.add(terrain);

    // ── FINALE glow (soft additive radial, faces the camera) ──────────────────
    const burstMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uI: { value: 0 }, uCol: { value: new THREE.Color('#8a6fff') } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */ `precision highp float; uniform float uI; uniform vec3 uCol; varying vec2 vUv;
        void main(){ float d=length(vUv-0.5); float g=smoothstep(0.5,0.02,d); gl_FragColor=vec4(uCol,g*g*uI);} `,
    });
    const burst = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), burstMat);
    scene.add(burst);

    // ── loop ──────────────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    const bg = new THREE.Color();
    let raf = 0, alive = true;

    const render = () => {
      const t = clock.getElapsedTime();
      const p = scroll.progress, lvl = scroll.level, arc = Math.min(1, p * 1.15);
      const finale = THREE.MathUtils.smoothstep(p, 0.8, 1.0);

      arcColor(p, bg);
      renderer.setClearColor(bg, 1);
      (scene.fog as THREE.FogExp2).color.copy(bg);

      const camZ = THREE.MathUtils.lerp(7, -32, easeInOut(p));
      camera.position.x += (scroll.mouseX * 1.1 - camera.position.x) * 0.05;
      camera.position.y += (0.4 - scroll.mouseY * 0.7 - camera.position.y) * 0.05;
      camera.position.z = camZ;
      camera.lookAt(scroll.mouseX * 0.5, 0.0, camZ - 8);

      pMat.uniforms.uTime.value = t; pMat.uniforms.uLevel.value = lvl; pMat.uniforms.uBloom.value = finale;
      for (const r of ribbons) {
        const u = (r.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = t; u.uLevel.value = lvl; u.uArc.value = arc;
      }
      const an = scrollSong.analyser;
      if (an) { an.getByteFrequencyData(fftData.subarray(0, Math.min(FBIN, an.frequencyBinCount))); fftTex.needsUpdate = true; }
      terrainMat.uniforms.uTime.value = t; terrainMat.uniforms.uLevel.value = lvl; terrainMat.uniforms.uBass.value = scroll.bass;
      terrainMat.uniforms.uArc.value = arc;
      terrainMat.uniforms.uVis.value = THREE.MathUtils.smoothstep(p, 0.3, 0.52) * THREE.MathUtils.smoothstep(p, 0.94, 0.72);

      burstMat.uniforms.uI.value = finale * (0.35 + lvl * 0.35);
      burst.position.set(camera.position.x, camera.position.y + 0.4, camZ - 7);
      burst.scale.setScalar(8 + finale * 6);
      burst.quaternion.copy(camera.quaternion);

      renderer.render(scene, camera);
    };

    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      render();
    };

    if (reduce) { scroll.progress = 0; render(); }
    else { raf = requestAnimationFrame(loop); }

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      pMat.uniforms.uPr.value = renderer.getPixelRatio();
    };
    window.addEventListener('resize', onResize);

    return () => {
      alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
      pg.dispose(); pMat.dispose(); ribGeo.dispose(); ribbons.forEach((r) => (r.material as THREE.Material).dispose());
      terrain.geometry.dispose(); terrainMat.dispose(); fftTex.dispose(); burst.geometry.dispose(); burstMat.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="lz-cinema" aria-hidden="true" />;
}

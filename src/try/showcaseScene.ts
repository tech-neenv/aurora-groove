import * as THREE from 'three';
import { StudioScreen } from './studioTexture';

// /try3 — THE SHOWCASE. A real-looking iPad running Aurora Groove Studio,
// revolving in warm-dark space. As you scroll, real instruments fly in and merge
// into the device with spark-blasts; the studio screen lights another layer.
// Editorial product-reveal structure (ORYZO-style), Aurora Groove brand.

const COL = ['#3fe0a6', '#35c0c8', '#49a6ea', '#5f8cf0', '#7b78f4', '#9b8cff', '#b478ea', '#ff6fae'];

function instrument(i: number): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Color(COL[i]);
  const mat = (wire = false, e = 0.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, metalness: 0.5, roughness: 0.3, wireframe: wire });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos?: [number, number, number], rot?: [number, number, number]) => { const me = new THREE.Mesh(geo, m); if (pos) me.position.set(...pos); if (rot) me.rotation.set(...rot); g.add(me); return me; };
  switch (i) {
    case 0: // DRUMS — snare + toms + rim
      add(new THREE.CylinderGeometry(0.9, 0.9, 0.7, 32), mat());
      add(new THREE.TorusGeometry(0.9, 0.06, 12, 32), mat(false, 0.9), [0, 0.35, 0], [Math.PI / 2, 0, 0]);
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 24), mat(), [1.1, 0.2, 0.4]);
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 24), mat(), [-1.1, 0.2, 0.4]); break;
    case 1: // BASS — body + neck
      add(new THREE.CapsuleGeometry(0.55, 0.6, 6, 16), mat(), [0, -0.6, 0]);
      add(new THREE.BoxGeometry(0.18, 2.2, 0.14), mat(false, 0.8), [0, 0.7, 0]); break;
    case 2: { // KEYS — keyboard slab + key stripes
      add(new THREE.BoxGeometry(2.6, 0.28, 1, 1, 1, 1), mat(false, 0.35));
      for (let k = 0; k < 10; k++) add(new THREE.BoxGeometry(0.2, 0.08, 0.7), mat(false, 0.9), [-1.15 + k * 0.24, 0.18, -0.05]);
      break; }
    case 3: // HATS — two cymbals
      add(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 32), mat(false, 0.9), [0, 0.18, 0]);
      add(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 32), mat(false, 0.9), [0, -0.05, 0]);
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), mat(), [0, -0.3, 0]); break;
    case 4: add(new THREE.TorusKnotGeometry(0.7, 0.24, 96, 16), mat()); break; // ARP
    case 5: add(new THREE.ConeGeometry(0.7, 1.8, 5), mat(false, 0.8)); break;   // LEAD
    case 6: add(new THREE.IcosahedronGeometry(0.95, 1), mat(true, 0.9)); break;  // PAD
    default: // FX — ring + spikes
      add(new THREE.TorusGeometry(0.8, 0.14, 16, 40), mat(false, 0.9));
      for (let s = 0; s < 8; s++) { const a = (s / 8) * Math.PI * 2; add(new THREE.ConeGeometry(0.1, 0.5, 8), mat(), [Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0], [0, 0, -a + Math.PI / 2]); }
  }
  return g;
}

interface Inst { group: THREE.Group; home: THREE.Vector3; color: THREE.Color; state: 'idle' | 'fly' | 'done'; t: number; }

export class ShowcaseScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private device = new THREE.Group();
  private screen: StudioScreen;
  private insts: Inst[] = [];
  private mergedN = 0;
  private glowTex: THREE.Texture;
  private deviceGlow: THREE.Sprite;

  // particle burst pool
  private pCount = 900;
  private pPos: Float32Array; private pVel: Float32Array; private pCol: Float32Array; private pLife: Float32Array;
  private pGeo: THREE.BufferGeometry; private pNext = 0;
  private bg = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    const small = window.innerWidth < 720;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene.fog = new THREE.FogExp2(new THREE.Color('#080511'), 0.04);
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 8.5);

    this.scene.add(new THREE.AmbientLight(0x5a6088, 1.0));
    const key = new THREE.DirectionalLight(0xbfc4ff, 1.4); key.position.set(3, 4, 6); this.scene.add(key);
    const rim = new THREE.PointLight(0x9b8cff, 2.4, 30); rim.position.set(-4, 2, 4); this.scene.add(rim);

    this.glowTex = this.makeGlow();

    // starfield
    const sg = new THREE.BufferGeometry(); const N = small ? 900 : 2000; const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { sp[i * 3] = (Math.random() * 2 - 1) * 30; sp[i * 3 + 1] = (Math.random() * 2 - 1) * 22; sp[i * 3 + 2] = -Math.random() * 60 - 4; }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x8f9bd8, size: 0.07, transparent: true, opacity: 0.6, depthWrite: false })));

    // ── iPad device ──
    this.screen = new StudioScreen();
    const W = 4.2, H = 3.1, D = 0.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshStandardMaterial({ color: 0x14121f, metalness: 0.85, roughness: 0.25 }));
    this.device.add(body);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, H - 0.12, D + 0.02), new THREE.MeshStandardMaterial({ color: 0x05040a, metalness: 0.6, roughness: 0.4 }));
    bezel.position.z = 0.005; this.device.add(bezel);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.34, H - 0.34), new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false }));
    scr.position.z = D / 2 + 0.012; this.device.add(scr);
    // back glow
    this.deviceGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x9b8cff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 }));
    this.deviceGlow.scale.setScalar(9); this.deviceGlow.position.z = -0.4; this.device.add(this.deviceGlow);
    this.scene.add(this.device);

    // ── instruments ──
    for (let i = 0; i < 8; i++) {
      const g = instrument(i);
      const ang = -Math.PI / 2 + i * (Math.PI * 2 / 8);
      const home = new THREE.Vector3(Math.cos(ang) * 6.5, Math.sin(ang) * 4.2, 2.5 + (i % 2) * 1.5);
      g.position.copy(home); g.scale.setScalar(0.001);
      this.scene.add(g);
      this.insts.push({ group: g, home, color: new THREE.Color(COL[i]), state: 'idle', t: 0 });
    }

    // ── burst pool ──
    this.pPos = new Float32Array(this.pCount * 3); this.pVel = new Float32Array(this.pCount * 3);
    this.pCol = new Float32Array(this.pCount * 3); this.pLife = new Float32Array(this.pCount);
    for (let i = 0; i < this.pCount; i++) { this.pPos[i * 3 + 2] = -999; }
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const pMat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.scene.add(new THREE.Points(this.pGeo, pMat));
  }

  private makeGlow(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,0.85)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.4)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  }

  resize() { this.renderer.setSize(window.innerWidth, window.innerHeight); this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
  mergedCount() { return this.mergedN; }

  triggerMerge(i: number) { const it = this.insts[i]; if (it && it.state === 'idle') { it.state = 'fly'; it.t = 0; } }

  private burst(center: THREE.Vector3, col: THREE.Color) {
    for (let k = 0; k < 110; k++) {
      const idx = this.pNext % this.pCount; this.pNext++;
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(2 + Math.random() * 4);
      this.pPos[idx * 3] = center.x; this.pPos[idx * 3 + 1] = center.y; this.pPos[idx * 3 + 2] = center.z;
      this.pVel[idx * 3] = dir.x; this.pVel[idx * 3 + 1] = dir.y; this.pVel[idx * 3 + 2] = dir.z;
      this.pCol[idx * 3] = col.r; this.pCol[idx * 3 + 1] = col.g; this.pCol[idx * 3 + 2] = col.b;
      this.pLife[idx] = 1;
    }
  }

  render(progress: number, mx: number, my: number, e: number, level: number, dt: number) {
    const p = Math.min(1, Math.max(0, progress));
    // arc bg (warm-dark aurora)
    const stops = ['#070510', '#0a0716', '#0d0a1e', '#140a20'];
    const s = p * (stops.length - 1); const si = Math.floor(s);
    this.bg.set(stops[si]).lerp(new THREE.Color(stops[si + 1] ?? stops[si]), s - si);
    this.renderer.setClearColor(this.bg, 1); (this.scene.fog as THREE.FogExp2).color.copy(this.bg);

    // camera parallax + gentle dolly
    this.camera.position.x += (mx * 0.9 - this.camera.position.x) * 0.05;
    this.camera.position.y += (-my * 0.7 - this.camera.position.y) * 0.05;
    this.camera.position.z = 8.5 - Math.sin(p * Math.PI) * 1.5;
    this.camera.lookAt(0, 0, 0);

    // device revolves through the scroll, settles to face front at the finale
    const finale = THREE.MathUtils.smoothstep(p, 0.9, 1);
    const spin = p * Math.PI * 3 + e * 0.15;
    this.device.rotation.y = THREE.MathUtils.lerp(spin, Math.round(spin / (Math.PI * 2)) * Math.PI * 2, finale);
    this.device.rotation.x = Math.sin(e * 0.4) * 0.08 + my * 0.15 - finale * 0.05;
    this.device.rotation.z = Math.sin(e * 0.3) * 0.03;
    this.device.scale.setScalar(1 + finale * 0.2 + level * 0.02);
    (this.deviceGlow.material as THREE.SpriteMaterial).opacity = 0.4 + level * 0.5 + finale * 0.4;
    this.deviceGlow.scale.setScalar(9 + this.mergedN * 0.5 + finale * 6);

    // screen UI
    this.screen.update(this.mergedN, e, level);

    // instrument fly-in
    const centre = new THREE.Vector3(0, 0, 0);
    for (const it of this.insts) {
      it.group.rotation.y += 0.02; it.group.rotation.x += 0.01;
      if (it.state === 'idle') {
        it.group.scale.setScalar(THREE.MathUtils.lerp(it.group.scale.x, 0.001, 0.1));
      } else if (it.state === 'fly') {
        it.t = Math.min(1, it.t + dt * 1.1);
        const ease = it.t * it.t * (3 - 2 * it.t);
        it.group.position.lerpVectors(it.home, centre, ease);
        it.group.scale.setScalar(THREE.MathUtils.lerp(1, 0.001, ease));
        if (it.t >= 1) { it.state = 'done'; it.group.visible = false; this.burst(centre, it.color); this.mergedN++; }
      }
      if (it.state === 'idle' && it.group.scale.x < 0.5) {
        // hover in place a touch (so it's visible before it's triggered)
      }
    }
    // reveal idle instruments near their act by scaling them up when close in scroll handled by page via triggerMerge; keep a soft presence:
    for (let i = 0; i < this.insts.length; i++) {
      const it = this.insts[i]; if (it.state !== 'idle') continue;
      const near = Math.abs(p - (0.08 + i * 0.1)) < 0.06 ? 1 : 0.001;
      it.group.scale.setScalar(THREE.MathUtils.lerp(it.group.scale.x, near, 0.12));
      it.group.position.copy(it.home).add(new THREE.Vector3(0, Math.sin(e * 1.5 + i) * 0.2, 0));
    }

    // particles
    for (let i = 0; i < this.pCount; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt * 0.9;
      this.pVel[i * 3] *= 0.94; this.pVel[i * 3 + 1] *= 0.94; this.pVel[i * 3 + 2] *= 0.94;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      const l = Math.max(0, this.pLife[i]);
      this.pCol[i * 3] *= 0.995; this.pCol[i * 3 + 1] *= 0.995; this.pCol[i * 3 + 2] *= 0.995;
      if (this.pLife[i] <= 0) this.pPos[i * 3 + 2] = -999;
      void l;
    }
    (this.pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose(); this.screen.dispose(); this.glowTex.dispose();
    this.scene.traverse((o) => { const a = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }; a.geometry?.dispose?.(); if (Array.isArray(a.material)) a.material.forEach((m) => m.dispose()); else a.material?.dispose?.(); });
  }
}

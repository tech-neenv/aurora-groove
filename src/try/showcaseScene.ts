import * as THREE from 'three';

// /try3 — CHAOS. No real instruments, no literal device. A central faceted core
// hangs in warm-dark space, wrapped in an escalating STORM of abstract geometry:
// a swirling particle vortex, a tumbling shard swarm, gyroscopic rings, and
// ribbons — all spinning at different rates. Every scroll act detonates a blast
// and adds another chaos layer + audio layer, until the whole field is a
// reactive maelstrom. Aurora Groove palette. Built to overwhelm.

const COL = ['#3fe0a6', '#35c0c8', '#49a6ea', '#5f8cf0', '#7b78f4', '#9b8cff', '#b478ea', '#ff6fae'];

function glowTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.3, 'rgba(255,255,255,.4)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

export class ShowcaseScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private glow = glowTex();
  private bg = new THREE.Color();

  private coreInner: THREE.Mesh; private coreWire: THREE.Mesh; private coreGlow: THREE.Sprite; private core = new THREE.Group();
  private active = 0;             // chaos/audio layers switched on
  private flash = 0; private shake = 0; private coreKick = 0;

  // vortex
  private vCount: number; private vGeo: THREE.BufferGeometry; private vBase: Float32Array; private vPos: Float32Array;
  // shard swarm (instanced)
  private shards: THREE.InstancedMesh; private sCount = 168; private sData: { ax: THREE.Vector3; sp: number; orbit: number; tilt: number; rad: number }[] = [];
  private dummy = new THREE.Object3D();
  // rings
  private rings: THREE.Mesh[] = [];
  // ribbons
  private ribbons: THREE.Mesh[] = [];
  // burst
  private pCount = 1400; private pGeo: THREE.BufferGeometry; private pPos: Float32Array; private pVel: Float32Array; private pCol: Float32Array; private pLife: Float32Array; private pNext = 0;
  // flash quad (rides in front of camera)
  private flashMesh: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    const small = window.innerWidth < 720;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;
    this.scene.fog = new THREE.FogExp2(new THREE.Color('#070510'), 0.035);
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera.position.set(0, 0, 9);

    this.scene.add(new THREE.AmbientLight(0x5a6088, 1.0));
    const d = new THREE.DirectionalLight(0xcfd4ff, 1.3); d.position.set(3, 4, 6); this.scene.add(d);
    const pl = new THREE.PointLight(0x9b8cff, 3, 40); pl.position.set(0, 0, 3); this.scene.add(pl);

    // ── core ──
    this.coreInner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshStandardMaterial({ color: 0x2a2440, emissive: 0x7b6fff, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.2, flatShading: true }));
    this.coreWire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 1), new THREE.MeshBasicMaterial({ color: 0xb8acff, wireframe: true, transparent: true, opacity: 0.5 }));
    this.coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0x9b8cff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
    this.coreGlow.scale.setScalar(7);
    this.core.add(this.coreInner, this.coreWire, this.coreGlow); this.scene.add(this.core);

    // ── vortex ──
    this.vCount = small ? 2600 : 5200;
    this.vBase = new Float32Array(this.vCount * 4); // radius, angle, y, speed
    this.vPos = new Float32Array(this.vCount * 3);
    const vcol = new Float32Array(this.vCount * 3);
    for (let i = 0; i < this.vCount; i++) {
      const rad = 2 + Math.pow(Math.random(), 0.6) * 6, ang = Math.random() * Math.PI * 2, y = (Math.random() * 2 - 1) * 3.4, sp = 0.2 + Math.random() * 0.8;
      this.vBase[i * 4] = rad; this.vBase[i * 4 + 1] = ang; this.vBase[i * 4 + 2] = y; this.vBase[i * 4 + 3] = sp;
      const c = new THREE.Color(COL[Math.floor(Math.random() * COL.length)]);
      vcol[i * 3] = c.r; vcol[i * 3 + 1] = c.g; vcol[i * 3 + 2] = c.b;
    }
    this.vGeo = new THREE.BufferGeometry();
    this.vGeo.setAttribute('position', new THREE.BufferAttribute(this.vPos, 3));
    this.vGeo.setAttribute('color', new THREE.BufferAttribute(vcol, 3));
    this.scene.add(new THREE.Points(this.vGeo, new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));

    // ── shard swarm ──
    this.shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.34), new THREE.MeshStandardMaterial({ metalness: 0.5, roughness: 0.22, flatShading: true }), this.sCount);
    const scol = new Float32Array(this.sCount * 3);
    for (let i = 0; i < this.sCount; i++) {
      this.sData.push({ ax: new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize(), sp: 0.5 + Math.random() * 2, orbit: Math.random() * Math.PI * 2, tilt: Math.random() * Math.PI, rad: 2.6 + Math.random() * 4 });
      const c = new THREE.Color(COL[i % COL.length]); scol[i * 3] = c.r; scol[i * 3 + 1] = c.g; scol[i * 3 + 2] = c.b;
    }
    this.shards.instanceColor = new THREE.InstancedBufferAttribute(scol, 3);
    this.scene.add(this.shards);

    // ── rings (one per layer, tilted, spinning) ──
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(2.2 + i * 0.5, 0.03 + (i % 3) * 0.015, 12, 120), new THREE.MeshBasicMaterial({ color: COL[i], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.set(i * 0.7, i * 1.3, i * 0.5); m.scale.setScalar(0.01); this.rings.push(m); this.scene.add(m);
    }

    // ── ribbons ──
    for (let i = 0; i < 3; i++) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2 + i; pts.push(new THREE.Vector3(Math.cos(a) * (3 + i), Math.sin(a * 1.5) * 2, Math.sin(a) * (3 + i))); }
      const curve = new THREE.CatmullRomCurve3(pts, true);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.05, 8, true), new THREE.MeshBasicMaterial({ color: COL[i * 2 + 1], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.ribbons.push(m); this.scene.add(m);
    }

    // ── burst pool ──
    this.pPos = new Float32Array(this.pCount * 3); this.pVel = new Float32Array(this.pCount * 3); this.pCol = new Float32Array(this.pCount * 3); this.pLife = new Float32Array(this.pCount);
    for (let i = 0; i < this.pCount; i++) this.pPos[i * 3 + 2] = -999;
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.scene.add(new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));

    // flash quad
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.scene.add(this.flashMesh);
  }

  resize() { this.renderer.setSize(window.innerWidth, window.innerHeight); this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
  mergedCount() { return this.active; }

  triggerMerge(i: number) {
    if (i + 1 <= this.active) return;
    this.active = i + 1;
    this.flash = 1; this.shake = 1; this.coreKick = 1;
    const c = new THREE.Color(COL[i % COL.length]);
    for (let k = 0; k < 220; k++) {
      const idx = this.pNext % this.pCount; this.pNext++;
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(3 + Math.random() * 7);
      this.pPos[idx * 3] = 0; this.pPos[idx * 3 + 1] = 0; this.pPos[idx * 3 + 2] = 0;
      this.pVel[idx * 3] = dir.x; this.pVel[idx * 3 + 1] = dir.y; this.pVel[idx * 3 + 2] = dir.z;
      this.pCol[idx * 3] = c.r; this.pCol[idx * 3 + 1] = c.g; this.pCol[idx * 3 + 2] = c.b; this.pLife[idx] = 1;
    }
  }

  render(progress: number, mx: number, my: number, e: number, level: number, dt: number) {
    const p = Math.min(1, Math.max(0, progress));
    const chaos = this.active / 8;                      // escalation 0..1
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.coreKick = Math.max(0, this.coreKick - dt * 2);

    const stops = ['#070510', '#0a0716', '#10081e', '#180a24'];
    const s = p * (stops.length - 1), si = Math.floor(s);
    this.bg.set(stops[si]).lerp(new THREE.Color(stops[si + 1] ?? stops[si]), s - si);
    this.renderer.setClearColor(this.bg, 1); (this.scene.fog as THREE.FogExp2).color.copy(this.bg);
    this.renderer.clear();

    // camera: slow orbit + parallax + blast shake
    const orbit = e * 0.06 + p * 1.2;
    const sh = this.shake * (Math.sin(e * 90) * 0.12);
    this.camera.position.x += ((Math.sin(orbit) * 2.4 + mx * 1.2) - this.camera.position.x) * 0.05 + sh;
    this.camera.position.y += ((-my * 0.9) - this.camera.position.y) * 0.05 + sh * 0.6;
    this.camera.position.z = 9 - Math.sin(p * Math.PI) * 2;
    this.camera.lookAt(0, 0, 0);

    // core — multi-axis tumble, pulse
    const beat = 1 + level * 0.4 + this.coreKick * 0.6;
    this.core.rotation.x += dt * (0.5 + chaos * 1.5); this.core.rotation.y += dt * (0.7 + chaos * 2); this.core.rotation.z += dt * 0.3;
    this.coreInner.scale.setScalar(beat); this.coreWire.scale.setScalar(beat * 1.06 + Math.sin(e * 3) * 0.04);
    (this.coreInner.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + level * 1.5 + this.coreKick * 2;
    this.coreGlow.scale.setScalar((6 + this.active * 0.6) * beat); (this.coreGlow.material as THREE.SpriteMaterial).opacity = 0.5 + level * 0.5 + this.flash * 0.4;

    // vortex — swirl faster with chaos + audio
    const spin = e * (0.3 + chaos * 1.2 + level * 0.8);
    for (let i = 0; i < this.vCount; i++) {
      const rad = this.vBase[i * 4], a = this.vBase[i * 4 + 1] + spin * this.vBase[i * 4 + 3], y = this.vBase[i * 4 + 2];
      const r = rad * (0.6 + chaos * 0.5) * (1 + level * 0.25 + this.coreKick * 0.4);
      this.vPos[i * 3] = Math.cos(a) * r; this.vPos[i * 3 + 1] = y + Math.sin(a * 2 + e) * 0.3; this.vPos[i * 3 + 2] = Math.sin(a) * r;
    }
    (this.vGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // shards — tumble on a rotating shell; only active-layer shards are visible
    const perLayer = this.sCount / 8;
    for (let i = 0; i < this.sCount; i++) {
      const layer = Math.floor(i / perLayer);
      const on = layer < this.active;
      const d = this.sData[i];
      const orb = d.orbit + e * d.sp * (0.4 + chaos);
      const rr = d.rad * (0.7 + chaos * 0.4) * (1 + this.coreKick * 0.5);
      this.dummy.position.set(Math.cos(orb) * rr, Math.sin(d.tilt) * rr * 0.6 * Math.sin(orb * 0.7 + e), Math.sin(orb) * rr);
      this.dummy.quaternion.setFromAxisAngle(d.ax, e * d.sp * 2);
      const sc = on ? (0.8 + level * 0.6 + this.coreKick * 0.5) : 0.001;
      this.dummy.scale.setScalar(sc);
      this.dummy.updateMatrix(); this.shards.setMatrixAt(i, this.dummy.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;

    // rings — grow/spin per active layer
    for (let i = 0; i < 8; i++) {
      const m = this.rings[i]; const on = i < this.active;
      m.rotation.x += dt * (0.2 + i * 0.05); m.rotation.y += dt * (0.3 + i * 0.04);
      m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, on ? (1 + level * 0.15) : 0.01, 0.1));
      (m.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp((m.material as THREE.MeshBasicMaterial).opacity, on ? 0.6 : 0, 0.1);
    }

    // ribbons — always swirling, brighter with chaos
    for (let i = 0; i < this.ribbons.length; i++) { const m = this.ribbons[i]; m.rotation.x += dt * 0.2 * (i + 1); m.rotation.y += dt * 0.3; (m.material as THREE.MeshBasicMaterial).opacity = 0.2 + chaos * 0.4 + level * 0.2; }

    // burst particles
    for (let i = 0; i < this.pCount; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt * 0.85;
      this.pVel[i * 3] *= 0.95; this.pVel[i * 3 + 1] *= 0.95; this.pVel[i * 3 + 2] *= 0.95;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pLife[i] <= 0) this.pPos[i * 3 + 2] = -999;
    }
    (this.pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // flash quad rides in front of camera
    const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
    this.flashMesh.position.copy(this.camera.position).add(fwd.multiplyScalar(4));
    this.flashMesh.quaternion.copy(this.camera.quaternion);
    (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = this.flash * 0.5;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose(); this.glow.dispose();
    this.scene.traverse((o) => { const a = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }; a.geometry?.dispose?.(); if (Array.isArray(a.material)) a.material.forEach((m) => m.dispose()); else a.material?.dispose?.(); });
  }
}

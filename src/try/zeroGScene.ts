import * as THREE from 'three';

// ZERO-G STUDIO — the flight. A tiny drone follows a spline down a dark orbital
// studio; at 8 stations two candidate objects orbit a socket. Pick one → it
// docks into the drone's core (which grows a ring) and its audio layer turns on.
// Raw three.js (no R3F) so it plays nicely with three 0.185.

const STATIONS = 8;
const stationT = (i: number) => 0.06 + i * 0.108;   // spread down the path
const ZONE = 0.05;                                    // how near counts as "at" a station

// per-layer identity: shape + aurora colour
const HEX = ['#3fe0a6', '#35c0c8', '#49a6ea', '#5f8cf0', '#7b78f4', '#9b8cff', '#b478ea', '#ff6fae'];
function geo(layer: number): THREE.BufferGeometry {
  switch (layer) {
    case 0: return new THREE.IcosahedronGeometry(1, 0);
    case 1: return new THREE.BoxGeometry(1.7, 0.5, 1.7);
    case 2: return new THREE.OctahedronGeometry(1.1, 0);
    case 3: return new THREE.DodecahedronGeometry(1, 0);
    case 4: return new THREE.TorusKnotGeometry(0.7, 0.26, 80, 12);
    case 5: return new THREE.ConeGeometry(0.9, 1.7, 24);
    case 6: return new THREE.SphereGeometry(1.05, 16, 12);
    default: return new THREE.TorusGeometry(0.9, 0.28, 16, 40);
  }
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface Candidate { mesh: THREE.Mesh; glow: THREE.Sprite; layer: number; variant: number; home: THREE.Vector3; }
interface Satellite { mesh: THREE.Mesh; glow: THREE.Sprite; layer: number; angle: number; docking: number; from: THREE.Vector3; }

export class ZeroGStudio {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private curve: THREE.CatmullRomCurve3;
  private ray = new THREE.Raycaster();
  private glowTex = glowTexture();

  private candidates: Candidate[] = [];
  private satellites: Satellite[] = [];
  private core: THREE.Group;
  private coreMesh: THREE.Mesh;
  private coreGlow: THREE.Sprite;
  private coreLight: THREE.PointLight;
  private picked = new Array(STATIONS).fill(-1) as number[];
  private coreCenter = new THREE.Vector3();
  private bg = new THREE.Color();

  hovered: { station: number; variant: number } | null = null;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    const small = window.innerWidth < 720;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene.fog = new THREE.FogExp2(new THREE.Color('#05040c'), 0.03);

    this.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 200);

    // winding descending corridor
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const z = -i * 9;
      pts.push(new THREE.Vector3(Math.sin(i * 0.7) * 5, Math.cos(i * 0.55) * 3 - i * 0.4, z));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);

    // lights
    this.scene.add(new THREE.AmbientLight(0x556080, 1.1));
    const hemi = new THREE.HemisphereLight(0x8a7bff, 0x0a1030, 0.6); this.scene.add(hemi);
    this.coreLight = new THREE.PointLight(0x9b8cff, 2.2, 40); this.scene.add(this.coreLight);

    // starfield for depth
    const sg = new THREE.BufferGeometry(); const N = small ? 1200 : 2600; const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { sp[i * 3] = (Math.random() * 2 - 1) * 40; sp[i * 3 + 1] = (Math.random() * 2 - 1) * 30; sp[i * 3 + 2] = -Math.random() * 100 + 6; }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x8fa0d8, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false })));

    // stations: two candidates each, offset either side of the path
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < STATIONS; i++) {
      const t = stationT(i);
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      for (let v = 0; v < 2; v++) {
        const home = p.clone().add(right.clone().multiplyScalar(v === 0 ? 3.2 : -3.2)).add(new THREE.Vector3(0, 0.4, 0));
        const col = new THREE.Color(HEX[i]);
        const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: v === 0 ? 0.7 : 0.35, metalness: 0.4, roughness: 0.35, wireframe: v === 1, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo(i), mat);
        mesh.position.copy(home); mesh.scale.setScalar(0.001); mesh.userData = { station: i, variant: v };
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
        glow.scale.setScalar(4); mesh.add(glow);
        this.scene.add(mesh);
        this.candidates.push({ mesh, glow, layer: i, variant: v, home });
      }
    }

    // the drone core (rides in front of the camera)
    this.core = new THREE.Group();
    this.coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), new THREE.MeshStandardMaterial({ color: 0xdfe0ff, emissive: 0x9b8cff, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.2, wireframe: true }));
    this.core.add(this.coreMesh);
    this.coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x9b8cff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    this.coreGlow.scale.setScalar(5); this.core.add(this.coreGlow);
    this.scene.add(this.core);
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
  }

  activeStation(t: number): number {
    for (let i = 0; i < STATIONS; i++) if (Math.abs(t - stationT(i)) < ZONE && this.picked[i] < 0) return i;
    return -1;
  }
  allDocked() { return this.picked.every((p) => p >= 0); }

  private arcColor(t: number, out: THREE.Color) {
    const stops = ['#06040f', '#08161e', '#0b1030', '#180a22'];
    const s = Math.min(0.999, Math.max(0, t)) * (stops.length - 1); const i = Math.floor(s);
    return out.set(stops[i]).lerp(new THREE.Color(stops[i + 1] ?? stops[i]), s - i);
  }

  // pick a candidate → dock it to the core, return which layer/variant (or null)
  private setRay(nx: number, ny: number) { this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera); }
  private intersectActive(active: number): Candidate | null {
    if (active < 0) return null;
    const targets = this.candidates.filter((c) => c.layer === active);
    const hit = this.ray.intersectObjects(targets.map((c) => c.mesh), false)[0];
    return hit ? targets.find((c) => c.mesh === hit.object) ?? null : null;
  }
  pointerMove(nx: number, ny: number, t: number) {
    const active = this.activeStation(t); this.setRay(nx, ny);
    const c = this.intersectActive(active);
    this.hovered = c ? { station: c.layer, variant: c.variant } : null;
    return this.hovered;
  }
  pointerDown(nx: number, ny: number, t: number): { station: number; variant: number } | null {
    const active = this.activeStation(t); this.setRay(nx, ny);
    const c = this.intersectActive(active);
    if (!c) return null;
    this.dock(c.layer, c.variant);
    return { station: c.layer, variant: c.variant };
  }
  // auto-pick default when the drone leaves a station without a choice
  forceDefault(layer: number) { if (this.picked[layer] < 0) this.dock(layer, 0); }

  private dock(layer: number, variant: number) {
    if (this.picked[layer] >= 0) return;
    this.picked[layer] = variant;
    const chosen = this.candidates.find((c) => c.layer === layer && c.variant === variant)!;
    const other = this.candidates.find((c) => c.layer === layer && c.variant !== variant);
    this.satellites.push({ mesh: chosen.mesh, glow: chosen.glow, layer, angle: Math.random() * Math.PI * 2, docking: 0, from: chosen.mesh.position.clone() });
    if (other) { (other.mesh.material as THREE.Material).transparent = true; other.mesh.userData.fading = true; }
  }

  render(t: number, mx: number, my: number, e: number, level: number) {
    const clamped = Math.min(1, Math.max(0, t));
    this.arcColor(clamped, this.bg);
    this.renderer.setClearColor(this.bg, 1);
    (this.scene.fog as THREE.FogExp2).color.copy(this.bg);

    // drone camera on the spline + handheld drift + cursor parallax
    const ct = Math.min(0.999, clamped);
    this.curve.getPointAt(ct, this.camPos);
    this.curve.getPointAt(Math.min(0.999, ct + 0.03), this.camLook);
    const drift = new THREE.Vector3(Math.sin(e * 0.7) * 0.25 + mx * 1.1, Math.cos(e * 0.6) * 0.2 - my * 0.9, 0);
    this.camera.position.lerp(this.camPos.clone().add(drift), 0.12);
    this.camera.lookAt(this.camLook.x + mx * 0.6, this.camLook.y - my * 0.5, this.camLook.z);
    this.camera.up.set(Math.sin(e * 0.3) * 0.04, 1, 0);

    // core rides ~6 units in front of the drone
    const fwd = new THREE.Vector3().subVectors(this.camLook, this.camPos).normalize();
    this.coreCenter.copy(this.camPos).add(fwd.multiplyScalar(6)).add(new THREE.Vector3(0, -0.3, 0));
    this.core.position.copy(this.coreCenter);
    this.coreLight.position.copy(this.coreCenter);
    const dockCount = this.satellites.length;
    const pulse = 1 + level * 0.35;
    this.coreMesh.rotation.y += 0.01; this.coreMesh.rotation.x += 0.004;
    this.coreMesh.scale.setScalar((0.7 + dockCount * 0.12) * pulse);
    (this.coreMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9 + level * 1.2;
    this.coreGlow.scale.setScalar((4 + dockCount * 0.7) * pulse);

    // candidates: rise + bob when their station is active, else shrink away
    const active = this.activeStation(clamped);
    for (const c of this.candidates) {
      const isDock = this.satellites.some((s) => s.mesh === c.mesh);
      if (isDock) continue;
      const near = c.layer === active;
      const fading = c.mesh.userData.fading;
      const target = fading ? 0.001 : near ? (this.hovered && this.hovered.station === c.layer && this.hovered.variant === c.variant ? 1.35 : 1) : 0.001;
      const sc = THREE.MathUtils.lerp(c.mesh.scale.x, target, 0.12);
      c.mesh.scale.setScalar(sc);
      c.mesh.position.copy(c.home).add(new THREE.Vector3(0, Math.sin(e * 1.4 + c.variant) * 0.18, 0));
      c.mesh.rotation.y += 0.012; c.mesh.rotation.x += 0.006;
      const gm = c.glow.material as THREE.SpriteMaterial; gm.opacity = THREE.MathUtils.lerp(gm.opacity, near && !fading ? 0.85 : 0, 0.1);
      if (fading && sc < 0.01) { c.mesh.visible = false; }
    }

    // satellites: fly to the core, then orbit it
    const radius = 2.2 + dockCount * 0.12;
    for (const s of this.satellites) {
      s.docking = Math.min(1, s.docking + 0.03);
      s.angle += 0.01;
      const orbit = this.coreCenter.clone().add(new THREE.Vector3(Math.cos(s.angle + s.layer) * radius, Math.sin(s.angle * 1.3 + s.layer) * radius * 0.5, Math.sin(s.angle + s.layer) * radius));
      const ease = s.docking * s.docking * (3 - 2 * s.docking);
      s.mesh.position.lerpVectors(s.from, orbit, ease);
      if (s.docking >= 1) s.from.copy(orbit); // keep tracking the moving core
      s.mesh.scale.setScalar(THREE.MathUtils.lerp(s.mesh.scale.x, 0.55, 0.1));
      s.mesh.rotation.y += 0.03;
      (s.glow.material as THREE.SpriteMaterial).opacity = 0.6;
    }

    // finale: ignite when all docked and near the end
    const finale = THREE.MathUtils.smoothstep(clamped, 0.9, 1.0) * (this.allDocked() ? 1 : 0.3);
    (this.coreMesh.material as THREE.MeshStandardMaterial).emissiveIntensity += finale * 3;
    this.coreGlow.scale.addScalar(finale * 10);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose(); this.glowTex.dispose();
    this.scene.traverse((o) => {
      const any = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      any.geometry?.dispose?.();
      if (Array.isArray(any.material)) any.material.forEach((m) => m.dispose());
      else any.material?.dispose?.();
    });
  }
}

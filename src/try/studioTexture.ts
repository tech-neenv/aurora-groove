import * as THREE from 'three';

// Live "studio running on the iPad" — drawn to a 2D canvas every frame and used
// as the device's screen texture. Pads light as layers merge; a waveform and
// transport animate to the track. Aurora Groove brand (not the ORYZO palette).

const LAYER_COL = ['#3fe0a6', '#35c0c8', '#49a6ea', '#5f8cf0', '#7b78f4', '#9b8cff', '#b478ea', '#ff6fae'];
const NAMES = ['DRUMS', 'BASS', 'KEYS', 'HATS', 'ARP', 'LEAD', 'PAD', 'FX'];

export class StudioScreen {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  constructor() {
    this.c = document.createElement('canvas'); this.c.width = 1024; this.c.height = 768;
    this.g = this.c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.c);
    this.texture.anisotropy = 4; this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  update(merged: number, t: number, level: number) {
    const g = this.g, W = 1024, H = 768;
    // canvas — brighter so the screen always reads as "on"
    g.fillStyle = '#0f0c22'; g.fillRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, 'rgba(63,224,166,0.14)'); grd.addColorStop(1, 'rgba(155,140,255,0.18)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);

    // header
    g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, 0, W, 92);
    g.font = '700 40px Bricolage Grotesque, sans-serif';
    const hx = 44;
    g.fillStyle = '#7fe8c4'; g.fillText('Aurora', hx, 60);
    const aw = g.measureText('Aurora ').width;
    g.fillStyle = '#f4f1ff'; g.fillText(' Groove', hx + aw, 60);
    g.font = '500 22px Bricolage Grotesque, sans-serif'; g.fillStyle = 'rgba(233,228,255,0.5)';
    g.fillText('STUDIO', W - 130, 56);

    // pads 4x2
    const pad = 150, gap = 26, gx = 60, gy = 140;
    for (let i = 0; i < 8; i++) {
      const cx = gx + (i % 4) * (pad + gap), cy = gy + Math.floor(i / 4) * (pad + gap);
      const on = i < merged;
      const col = LAYER_COL[i];
      g.beginPath(); this.round(g, cx, cy, pad, pad, 20);
      if (on) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
        g.fillStyle = this.rgba(col, 0.16 + pulse * 0.12); g.fill();
        g.lineWidth = 3; g.strokeStyle = col; g.stroke();
        g.shadowColor = col; g.shadowBlur = 30; g.stroke(); g.shadowBlur = 0;
        g.font = '700 26px Bricolage Grotesque, sans-serif'; g.fillStyle = '#fff';
        g.textAlign = 'center'; g.fillText(NAMES[i], cx + pad / 2, cy + pad / 2 + 9); g.textAlign = 'left';
      } else {
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill();
        g.lineWidth = 2; g.strokeStyle = 'rgba(184,172,255,0.28)'; g.stroke();
        g.font = '500 24px monospace'; g.fillStyle = 'rgba(233,228,255,0.4)';
        g.textAlign = 'center'; g.fillText(String(i + 1).padStart(2, '0'), cx + pad / 2, cy + pad / 2 + 8); g.textAlign = 'left';
      }
    }

    // waveform
    const wy = 560, ww = W - 120, wx = 60;
    g.beginPath(); g.moveTo(wx, wy);
    for (let x = 0; x <= ww; x += 6) {
      const u = x / ww;
      const amp = (26 + level * 90) * (merged / 8 + 0.45);
      const y = wy + Math.sin(u * 40 + t * 4) * amp * Math.sin(u * Math.PI);
      g.lineTo(wx + x, y);
    }
    g.lineWidth = 3; g.strokeStyle = '#6fb0f0'; g.shadowColor = '#49a6ea'; g.shadowBlur = 18; g.stroke(); g.shadowBlur = 0;

    // transport
    g.fillStyle = 'rgba(255,255,255,0.05)'; this.round(g, 60, 650, W - 120, 70, 16); g.fill();
    for (let i = 0; i < 16; i++) {
      const bx = 96 + i * ((W - 200) / 16);
      const active = Math.floor((t * 4) % 16) === i && merged > 0;
      g.fillStyle = active ? '#9b8cff' : 'rgba(184,172,255,0.22)';
      g.fillRect(bx, 672, 22, 26);
    }
    g.font = '600 20px Bricolage Grotesque, sans-serif'; g.fillStyle = 'rgba(233,228,255,0.7)';
    g.fillText(merged + '/8 LAYERS', W - 210, 692);

    this.texture.needsUpdate = true;
  }

  private round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  private rgba(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  dispose() { this.texture.dispose(); }
}

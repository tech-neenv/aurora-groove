// Aurora shader (brief Section 2, the signature look): layered value-noise
// ribbons, NOT a texture. Amplitude reacts to the live song (uAmp uniform) so
// it doubles as a waveform. Teal→violet in early chapters; magenta (aurora3)
// only earns its place near the climax via uClimax.

export const auroraVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const auroraFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAmp;    // live audio amplitude 0..1
  uniform float uClimax; // 0..1 — unlocks magenta at the end
  uniform vec3 uC1;      // teal
  uniform vec3 uC2;      // violet
  uniform vec3 uC3;      // magenta

  vec3 hash3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
    return -1.0+2.0*fract(sin(p)*43758.5453123); }
  float vnoise(vec3 x){ vec3 p=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
    float n=0.0;
    for(int i=0;i<2;i++)for(int j=0;j<2;j++)for(int k=0;k<2;k++){
      vec3 o=vec3(float(i),float(j),float(k));
      n+=(1.0-abs(f.x-o.x))*(1.0-abs(f.y-o.y))*(1.0-abs(f.z-o.z))*dot(hash3(p+o),f-o);
    } return 0.5+0.5*n; }
  float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5;} return s; }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.06;

    // vertical curtains: sample noise mostly along x, drifting up over time
    float amp = 0.35 + uAmp * 0.9;
    float ribbons = fbm(vec3(uv.x * 3.0, uv.y * 1.3 - t * 2.0, t));
    ribbons += 0.5 * fbm(vec3(uv.x * 7.0 + 10.0, uv.y * 2.0 - t * 3.0, t * 1.4));

    // waveform bias: amplitude pushes the curtain height
    float curtain = smoothstep(0.15, 0.9, ribbons) * amp;

    // fade top & bottom so it reads as light in the sky, not a full quad
    float vfade = smoothstep(0.0, 0.25, uv.y) * smoothstep(1.0, 0.55, uv.y);
    curtain *= vfade;

    // colour: teal at base → violet up high, magenta bleeds in at climax
    vec3 col = mix(uC1, uC2, smoothstep(0.2, 0.85, uv.y + ribbons * 0.15));
    col = mix(col, uC3, uClimax * smoothstep(0.4, 1.0, ribbons));

    float alpha = clamp(curtain * 1.35, 0.0, 1.0);
    gl_FragColor = vec4(col * (0.85 + curtain * 2.2), alpha);
  }
`;

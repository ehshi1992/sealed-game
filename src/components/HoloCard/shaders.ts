// ── GLSL ──────────────────────────────────────────────────────────────────

export const VERT_SRC = /* glsl */`
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

export const FRAG_SRC = /* glsl */`
  precision mediump float;

  uniform vec2      u_resolution;
  uniform vec2      u_seed_offset;
  uniform vec2      u_pointer;
  uniform float     u_time;
  uniform int       u_holo_mode;
  uniform vec4      u_artwork_bounds;
  uniform int       u_holo_density;
  uniform sampler2D u_spiral_tex_primary;
  uniform sampler2D u_spiral_tex_accent;
  uniform vec2      u_spiral_centres[7];
  uniform float     u_spiral_scales[7];
  uniform float     u_spiral_rotations[7];

  // ── Hash ─────────────────────────────────────────────────────────────────

  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  vec2 hash2(vec2 p) {
    return vec2(
      fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
      fract(sin(dot(p, vec2(269.5, 183.3))) * 37623.1122)
    );
  }

  // ── Colour ────────────────────────────────────────────────────────────────

  vec3 hsl2rgb(float h, float s, float l) {
    h = fract(h);
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if      (h < 0.1667) rgb = vec3(c, x, 0.0);
    else if (h < 0.3333) rgb = vec3(x, c, 0.0);
    else if (h < 0.5000) rgb = vec3(0.0, c, x);
    else if (h < 0.6667) rgb = vec3(0.0, x, c);
    else if (h < 0.8333) rgb = vec3(x, 0.0, c);
    else                 rgb = vec3(c, 0.0, x);
    return rgb + m;
  }

  // ── Orb layer ─────────────────────────────────────────────────────────────

  vec4 orbLayer(vec2 seeded, float cellSize, float minR, float maxR,
                float tiltHue, float angleIntensity) {
    vec2 cell = floor(seeded / cellSize);
    vec4 result = vec4(0.0);
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 nb  = cell + vec2(float(dx), float(dy));
        vec2 rnd = hash2(nb + u_seed_offset * 7.3);
        vec2 centre = (nb + rnd) * cellSize;
        float r = minR + rnd.x * (maxR - minR);
        float d = length(seeded - centre);
        if (d < r) {
          float orbHue = fract(tiltHue + hash1(nb) * 0.35);
          float edge   = smoothstep(r, r * 0.3, d);
          float bright = 0.45 + edge * 0.45 + angleIntensity * 0.15;
          result = vec4(hsl2rgb(orbHue, 1.0, clamp(bright, 0.0, 1.0)), edge * 0.85);
        }
      }
    }
    return result;
  }

  // ── Dot field ─────────────────────────────────────────────────────────────

  float sparkleField(vec2 seeded, float scale) {
    vec2 cell = floor(seeded * scale);
    vec2 rnd  = hash2(cell + u_seed_offset * 3.1);
    if (rnd.x > 0.25) return 0.0;
    vec2 centre = (cell + rnd) / scale;
    return smoothstep(0.004, 0.0, length(seeded - centre));
  }

  // ── UV rotation helper ────────────────────────────────────────────────────

  vec2 rotateUV(vec2 uv, float angle) {
    float c = cos(angle), s = sin(angle);
    return vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    uv.y = 1.0 - uv.y;

    bool in_art = uv.x >= u_artwork_bounds.x &&
                  uv.x <= u_artwork_bounds.x + u_artwork_bounds.z &&
                  uv.y >= u_artwork_bounds.y &&
                  uv.y <= u_artwork_bounds.y + u_artwork_bounds.w;

    if (u_holo_mode == 1 && !in_art) { gl_FragColor = vec4(0.0); return; }
    if (u_holo_mode == 2 &&  in_art) { gl_FragColor = vec4(0.0); return; }
    if (u_holo_mode == 0)             { gl_FragColor = vec4(0.0); return; }

    vec2 seeded = uv + u_seed_offset + (u_pointer - 0.5) * 0.05;

    float tiltHue       = fract(u_pointer.x * 0.8 + u_pointer.y * 0.3 + u_time * 0.02);
    float angleIntensity = length(u_pointer - vec2(0.5)) * 1.8;

    float largeCell, medCell, smallCell;
    if      (u_holo_density == 3) { largeCell = 0.10; medCell = 0.045; smallCell = 0.018; }
    else if (u_holo_density == 2) { largeCell = 0.12; medCell = 0.055; smallCell = 0.022; }
    else if (u_holo_density == 1) { largeCell = 0.15; medCell = 0.068; smallCell = 0.027; }
    else                          { largeCell = 0.18; medCell = 0.085; smallCell = 0.033; }

    vec4 oLarge  = orbLayer(seeded, largeCell,  largeCell*0.12, largeCell*0.22, tiltHue, angleIntensity);
    vec4 oMedium = orbLayer(seeded, medCell,    medCell*0.12,   medCell*0.22,   tiltHue, angleIntensity);
    vec4 oSmall  = orbLayer(seeded, smallCell,  smallCell*0.12, smallCell*0.22, tiltHue, angleIntensity);

    vec3  orbCol   = vec3(0.0);
    float orbAlpha = 0.0;
    if (oLarge.a  > 0.0) { orbCol = oLarge.rgb;  orbAlpha = oLarge.a; }
    if (oMedium.a > 0.0) { orbCol = mix(orbCol, oMedium.rgb, oMedium.a); orbAlpha = max(orbAlpha, oMedium.a); }
    if (oSmall.a  > 0.0) { orbCol = mix(orbCol, oSmall.rgb,  oSmall.a);  orbAlpha = max(orbAlpha, oSmall.a);  }

    float sp    = sparkleField(seeded, 280.0);
    vec3  spCol = hsl2rgb(fract(tiltHue + 0.1), 0.9, 0.8);

    float spiralAcc    = 0.0;
    float spiralHueOff = 0.0;

    for (int i = 0; i < 3; i++) {
      float sc  = u_spiral_scales[i];
      vec2 localUV = rotateUV(seeded - u_spiral_centres[i], u_spiral_rotations[i]) / sc + 0.5;
      if (localUV.x >= 0.0 && localUV.x <= 1.0 && localUV.y >= 0.0 && localUV.y <= 1.0) {
        float v = texture2D(u_spiral_tex_primary, localUV).r;
        if (v > spiralAcc) {
          spiralAcc    = v;
          spiralHueOff = hash1(u_spiral_centres[i] + vec2(0.1)) * 0.4;
        }
      }
    }
    for (int i = 3; i < 7; i++) {
      float sc  = u_spiral_scales[i];
      vec2 localUV = rotateUV(seeded - u_spiral_centres[i], u_spiral_rotations[i]) / sc + 0.5;
      if (localUV.x >= 0.0 && localUV.x <= 1.0 && localUV.y >= 0.0 && localUV.y <= 1.0) {
        float v = texture2D(u_spiral_tex_accent, localUV).r * 0.85;
        spiralAcc = max(spiralAcc, v);
      }
    }
    spiralAcc = clamp(spiralAcc, 0.0, 1.0);
    vec3 spiralCol = hsl2rgb(fract(tiltHue + spiralHueOff), 1.0, 0.65);

    vec3  col   = orbCol;
    float alpha = orbAlpha;
    col   = mix(col, spCol, sp * 0.9);
    alpha = max(alpha, sp * (0.5 + angleIntensity * 0.4));
    col   = mix(col, spiralCol, spiralAcc * 0.6);
    alpha = max(alpha, spiralAcc * 0.5);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`

// ── Spiral texture generation ─────────────────────────────────────────────

export const SPIRAL_TEX_SIZE = 128

export interface SpiralParams {
  numArms: number; N: number; b: number
  armSpread: number; minDotR: number; maxDotR: number; sizePower: number
}

export const SPIRAL_PRIMARY: SpiralParams = {
  numArms: 2, N: 300, b: 0.22, armSpread: 0.28, minDotR: 0.3, maxDotR: 10, sizePower: 2.5
}
export const SPIRAL_ACCENT: SpiralParams = {
  numArms: 2, N: 220, b: 0.28, armSpread: 0.16, minDotR: 0.4, maxDotR: 12, sizePower: 3.0
}

function _h1(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}
function _ss(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function buildSpiralDots(p: SpiralParams) {
  const dots: Array<{r:number,theta:number,dotR:number,brightness:number}> = []
  const maxTheta = 2.8 * Math.PI, outerR = 0.88
  for (let arm = 0; arm < p.numArms; arm++) {
    const off = (arm / p.numArms) * 2 * Math.PI
    const perArm = Math.floor(p.N / p.numArms)
    for (let i = 0; i < perArm; i++) {
      const t = (i + 1) / perArm
      const rBase = Math.exp(p.b * t * maxTheta / (2 * Math.PI)) - 1
      const rNorm = rBase / (Math.exp(p.b * maxTheta / (2 * Math.PI)) - 1) * outerR
      if (rNorm < 0.03) continue
      const sc = (_h1(i * 3.7 + arm * 91, i * 2.1) * 2 - 1) * p.armSpread
      const theta = t * maxTheta + off + sc / Math.max(rNorm, 0.1)
      const rSc = (_h1(i * 5.3 + arm * 17, i + 3) * 2 - 1) * 0.06
      const r = Math.max(0.02, Math.min(outerR, rNorm + rSc))
      const rnd = _h1(i * 7.1 + arm * 53, i * 4.3 + 1)
      const tSize = Math.pow(rnd * 0.65 + (r / outerR) * 0.35, p.sizePower)
      dots.push({ r, theta, dotR: p.minDotR + (p.maxDotR - p.minDotR) * tSize, brightness: 0.35 + tSize * 0.65 })
    }
  }
  const extras = Math.floor(p.N * 0.12)
  for (let i = 0; i < extras; i++) {
    const r = (0.15 + _h1(i * 11.3, i * 6.7) * 0.75) * outerR
    const theta = _h1(i * 3.9, i + 77) * 2 * Math.PI
    const tp = Math.pow(_h1(i * 2.1, i * 8.4), p.sizePower * 0.6)
    dots.push({ r, theta, dotR: p.minDotR * 1.5 + p.maxDotR * 0.6 * tp, brightness: 0.5 + tp * 0.5 })
  }
  return dots
}

export function generateSpiralTexture(params: SpiralParams, size = SPIRAL_TEX_SIZE): Uint8Array {
  const buf = new Float32Array(size * size)
  const cx = size / 2, scale = size * 0.46
  for (const { r, theta, dotR, brightness } of buildSpiralDots(params)) {
    const px = cx + r * scale * Math.cos(theta)
    const py = cx + r * scale * Math.sin(theta)
    const sr = Math.ceil(dotR + 1.5)
    for (let dy = -sr; dy <= sr; dy++) {
      for (let dx = -sr; dx <= sr; dx++) {
        const ix = Math.round(px + dx), iy = Math.round(py + dy)
        if (ix < 0 || ix >= size || iy < 0 || iy >= size) continue
        const v = _ss(dotR, dotR * 0.2, Math.sqrt(dx * dx + dy * dy)) * brightness
        const idx = iy * size + ix
        if (v > buf[idx]) buf[idx] = v
      }
    }
  }
  const out = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(buf[i] * 255)
    out[i * 4 + 0] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255
  }
  return out
}

// ── Spiral centre pre-computation ─────────────────────────────────────────

const MIN_SPIRAL_DIST = 0.22
const MAX_CANDIDATES  = 30

export interface SpiralLayout {
  centres:   Float32Array  // 7 * 2 floats (x,y pairs)
  scales:    Float32Array  // 7 floats
  rotations: Float32Array  // 7 floats
}

export function computeSpiralLayout(seedOffset: {x: number; y: number}): SpiralLayout {
  const centres:   number[] = []
  const scales:    number[] = []
  const rotations: number[] = []

  function h1(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  function tooClose(cx: number, cy: number): boolean {
    for (let i = 0; i < centres.length; i += 2) {
      const dx = cx - centres[i], dy = cy - centres[i + 1]
      if (Math.sqrt(dx * dx + dy * dy) < MIN_SPIRAL_DIST) return true
    }
    return false
  }

  const sx = seedOffset.x, sy = seedOffset.y

  // 3 primary (scale 10–14%)
  for (let i = 0, placed = 0; i < MAX_CANDIDATES && placed < 3; i++) {
    const cx = 0.10 + h1(i * 7.3 + sx * 31, i * 3.1 + sy * 17) * 0.80
    const cy = 0.10 + h1(i * 4.9 + sx * 23 + 1, i * 8.7 + sy * 41) * 0.80
    if (tooClose(cx, cy)) continue
    centres.push(cx, cy)
    scales.push(0.10 + h1(i + sx * 7, i * 5 + sy * 3) * 0.04)
    rotations.push(h1(i * 17 + sx * 13, i * 23 + sy * 19) * Math.PI * 2)
    placed++
  }

  // 4 accent (scale 6.5–9.5%)
  for (let i = 0, placed = 0; i < MAX_CANDIDATES && placed < 4; i++) {
    const cx = 0.08 + h1(i * 11.3 + sx * 37 + 33, i * 6.7 + sy * 29) * 0.84
    const cy = 0.08 + h1(i * 5.7  + sx * 43 + 33, i * 9.3 + sy * 11) * 0.84
    if (tooClose(cx, cy)) continue
    centres.push(cx, cy)
    scales.push(0.065 + h1(i + sx * 5 + 33, i * 3 + sy * 7) * 0.03)
    rotations.push(h1(i * 13 + sx * 29 + 33, i * 19 + sy * 37) * Math.PI * 2)
    placed++
  }

  // Pad to 7 if min-distance rejection left gaps
  while (centres.length < 14) centres.push(centres[0] ?? 0.5, centres[1] ?? 0.5)
  while (scales.length < 7) scales.push(0.08)
  while (rotations.length < 7) rotations.push(0)

  return {
    centres:   new Float32Array(centres.slice(0, 14)),
    scales:    new Float32Array(scales.slice(0, 7)),
    rotations: new Float32Array(rotations.slice(0, 7)),
  }
}

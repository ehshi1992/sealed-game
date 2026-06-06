# Holo Shader Implementation — Tasks 6–10

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Supersedes:** `2026-06-06-holo-shader.md` Tasks 6–10 only. Tasks 1–5 in the original plan are already merged (commit `89947c8`).

**Goal:** Implement the WebGL cosmo foil shader stack using the pattern finalized in `docs/cosmo-bitmap-preview.html` (v8). Pattern spec: sparse scattered orbs (small) + dot-cluster spiral stamps (with min-distance separation) + fine dot field. Spiral centres pre-computed in JS with min-distance rejection, passed as uniforms.

**Pattern parameters (locked from preview v8):**
- Large orbs: N≈22, minR=0.012, maxR=0.038 (UV coords)
- Medium orbs: N≈45, minR=0.006, maxR=0.015 (UV coords)
- Spiral stamps: 3 primary (scale 10–14%) + 4 accent (scale 6.5–9.5%)
- Min spiral separation: 0.22 (UV distance)
- Spiral textures: PRIMARY={numArms:2,N:300,b:0.22,armSpread:0.28,minDotR:0.3,maxDotR:10,sizePower:2.5}, ACCENT={numArms:2,N:220,b:0.28,armSpread:0.16,minDotR:0.4,maxDotR:12,sizePower:3.0}

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/HoloCard/shaders.ts` | GLSL vertex + fragment source + spiral texture generator + centre pre-computation |
| Create | `src/components/HoloCard/useHoloShader.ts` | WebGL lifecycle hook, uploads textures, passes computed centres as uniforms |
| Modify | `src/components/HoloCard/HoloCard.tsx` | Add `<canvas>`, integrate hook, `holoSeed` prop |
| Modify | `src/components/HoloCard/HoloCard.css` | Style canvas overlay |
| Modify | `src/routes/Collection.tsx` | Pass `holo_seed` from collection entry to HoloCard |

---

## Task 6: GLSL Shaders + Texture + Centre Computation

**Files:**
- Create: `src/components/HoloCard/shaders.ts`

### Design rationale

Spiral dot-cluster stamps require iterating over N dot positions — too expensive per pixel in GLSL. Solution:
1. JS generates spiral textures (128×128 greyscale) once at init, uploaded via `gl.texImage2D`
2. JS pre-computes spiral centre positions with min-distance rejection per `holo_seed`, passed as `uniform vec2 u_spiral_centres[7]`
3. GLSL simply samples the texture at each centre's local UV

Orbs use a seeded hash grid (deterministic, no JS pre-computation needed).

### Uniforms

```glsl
uniform vec2      u_resolution;
uniform vec2      u_seed_offset;         // holo_seed — shifts orb grid + used as spiral seed
uniform vec2      u_pointer;             // normalized mouse/touch [0,1]
uniform float     u_time;
uniform int       u_holo_mode;           // 0=none 1=full_holo 2=reverse_holo
uniform vec4      u_artwork_bounds;      // xywh [0,1] fractions
uniform int       u_holo_density;        // 0=reverse 1=standard 2=full_art 3=rainbow
uniform sampler2D u_spiral_tex_primary;
uniform sampler2D u_spiral_tex_accent;
uniform vec2      u_spiral_centres[7];   // [0..2]=primary, [3..6]=accent
uniform float     u_spiral_scales[7];    // scale per spiral (fraction of card)
uniform float     u_spiral_rotations[7]; // rotation per spiral (radians)
```

- [ ] **Step 1: Create `src/components/HoloCard/shaders.ts`**

```ts
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
  // Hash grid: each cell has one orb at a random sub-cell position.
  // Orb radius is a small fraction of cell size to match reference pattern.

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

    // Orb cell sizes per density (orb radii are ~22% of cell size, matching preview)
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

    // Spiral stamps — centres pre-computed in JS with min-distance rejection
    float spiralAcc    = 0.0;
    float spiralHueOff = 0.0;

    // Primary (indices 0–2)
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
    // Accent (indices 3–6)
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
// Generates 3 primary + 4 accent spiral positions with min-distance rejection.
// seedOffset from holo_seed ensures unique layout per card instance.

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

  // Pad to 7 if min-distance rejection left gaps (rare)
  while (centres.length < 14) centres.push(centres[0] ?? 0.5, centres[1] ?? 0.5)
  while (scales.length < 7) scales.push(0.08)
  while (rotations.length < 7) rotations.push(0)

  return {
    centres:   new Float32Array(centres.slice(0, 14)),
    scales:    new Float32Array(scales.slice(0, 7)),
    rotations: new Float32Array(rotations.slice(0, 7)),
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/HoloCard/shaders.ts
git commit -m "feat: add cosmo foil GLSL shaders — sparse orbs, texture-sampled dot-cluster spirals, sparkles"
```

---

## Task 7: useHoloShader Hook

**Files:**
- Create: `src/components/HoloCard/useHoloShader.ts`
- Create: `src/components/HoloCard/__tests__/useHoloShader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/HoloCard/__tests__/useHoloShader.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useHoloShader } from '../useHoloShader'

const makeGLMock = () => ({
  createShader: vi.fn(() => ({})),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  getShaderInfoLog: vi.fn(() => ''),
  createProgram: vi.fn(() => ({})),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  getProgramInfoLog: vi.fn(() => ''),
  useProgram: vi.fn(),
  createBuffer: vi.fn(() => ({})),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  getAttribLocation: vi.fn(() => 0),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  enable: vi.fn(),
  blendFunc: vi.fn(),
  getUniformLocation: vi.fn(() => ({})),
  viewport: vi.fn(),
  clear: vi.fn(),
  uniform2f: vi.fn(),
  uniform2fv: vi.fn(),
  uniform1f: vi.fn(),
  uniform1fv: vi.fn(),
  uniform1i: vi.fn(),
  uniform4f: vi.fn(),
  drawArrays: vi.fn(),
  getExtension: vi.fn(() => null),
  deleteShader: vi.fn(),
  createTexture: vi.fn(() => ({})),
  activeTexture: vi.fn(),
  bindTexture: vi.fn(),
  texImage2D: vi.fn(),
  texParameteri: vi.fn(),
  COLOR_BUFFER_BIT: 0x4000,
  VERTEX_SHADER: 0x8B31,
  FRAGMENT_SHADER: 0x8B30,
  COMPILE_STATUS: 0x8B81,
  LINK_STATUS: 0x8B82,
  ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88B4,
  FLOAT: 0x1406,
  TRIANGLES: 0x0004,
  BLEND: 0x0BE2,
  SRC_ALPHA: 0x0302,
  ONE_MINUS_SRC_ALPHA: 0x0303,
  TEXTURE0: 0x84C0,
  TEXTURE_2D: 0x0DE1,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  LINEAR: 0x2601,
  CLAMP_TO_EDGE: 0x812F,
})

describe('useHoloShader', () => {
  let glMock: ReturnType<typeof makeGLMock>

  beforeEach(() => {
    glMock = makeGLMock()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(glMock as any)
  })

  it('initialises WebGL and calls drawArrays', async () => {
    renderHook(() => {
      const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
      useHoloShader(canvasRef, {
        seedOffset: { x: 0.3, y: 0.7 },
        artworkBounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
        holoMode: 'full_holo',
        holoType: 'standard',
        pointer: { x: 0.5, y: 0.5 },
      })
      return canvasRef
    })
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).toHaveBeenCalled()
  })

  it('does not throw when canvas ref is null', () => {
    expect(() => {
      renderHook(() => {
        const canvasRef = useRef<HTMLCanvasElement>(null as any)
        useHoloShader(canvasRef, {
          seedOffset: { x: 0, y: 0 },
          artworkBounds: null,
          holoMode: 'none',
          holoType: 'none',
          pointer: { x: 0.5, y: 0.5 },
        })
      })
    }).not.toThrow()
  })

  it('does not throw when WebGL unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => {
      renderHook(() => {
        const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
        useHoloShader(canvasRef, {
          seedOffset: { x: 0, y: 0 },
          artworkBounds: null,
          holoMode: 'full_holo',
          holoType: 'standard',
          pointer: { x: 0.5, y: 0.5 },
        })
      })
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
npx vitest run src/components/HoloCard/__tests__/useHoloShader.test.ts
```

Expected: FAIL — `useHoloShader` not found.

- [ ] **Step 3: Create `src/components/HoloCard/useHoloShader.ts`**

```ts
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import {
  VERT_SRC, FRAG_SRC,
  generateSpiralTexture, computeSpiralLayout,
  SPIRAL_PRIMARY, SPIRAL_ACCENT, SPIRAL_TEX_SIZE,
} from './shaders'
import type { ArtworkBounds, HoloMode, HoloSeed, HoloType } from '../../types'

interface HoloShaderOpts {
  seedOffset:    HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode:      HoloMode
  holoType:      HoloType
  pointer:       { x: number; y: number }
}

type Uniforms = {
  u_resolution:         WebGLUniformLocation | null
  u_seed_offset:        WebGLUniformLocation | null
  u_pointer:            WebGLUniformLocation | null
  u_time:               WebGLUniformLocation | null
  u_holo_mode:          WebGLUniformLocation | null
  u_artwork_bounds:     WebGLUniformLocation | null
  u_holo_density:       WebGLUniformLocation | null
  u_spiral_tex_primary: WebGLUniformLocation | null
  u_spiral_tex_accent:  WebGLUniformLocation | null
  u_spiral_centres:     WebGLUniformLocation | null
  u_spiral_scales:      WebGLUniformLocation | null
  u_spiral_rotations:   WebGLUniformLocation | null
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function uploadTexture(
  gl: WebGLRenderingContext, unit: number, data: Uint8Array, size: number
): void {
  gl.activeTexture(gl.TEXTURE0 + unit)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

function initGL(canvas: HTMLCanvasElement): { gl: WebGLRenderingContext; uniforms: Uniforms } | null {
  const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
  if (!gl) return null

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  if (!vert || !frag) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
  const posLoc = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  uploadTexture(gl, 1, generateSpiralTexture(SPIRAL_PRIMARY, SPIRAL_TEX_SIZE), SPIRAL_TEX_SIZE)
  uploadTexture(gl, 2, generateSpiralTexture(SPIRAL_ACCENT,  SPIRAL_TEX_SIZE), SPIRAL_TEX_SIZE)

  const uniforms: Uniforms = {
    u_resolution:         gl.getUniformLocation(program, 'u_resolution'),
    u_seed_offset:        gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:            gl.getUniformLocation(program, 'u_pointer'),
    u_time:               gl.getUniformLocation(program, 'u_time'),
    u_holo_mode:          gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds:     gl.getUniformLocation(program, 'u_artwork_bounds'),
    u_holo_density:       gl.getUniformLocation(program, 'u_holo_density'),
    u_spiral_tex_primary: gl.getUniformLocation(program, 'u_spiral_tex_primary'),
    u_spiral_tex_accent:  gl.getUniformLocation(program, 'u_spiral_tex_accent'),
    u_spiral_centres:     gl.getUniformLocation(program, 'u_spiral_centres'),
    u_spiral_scales:      gl.getUniformLocation(program, 'u_spiral_scales'),
    u_spiral_rotations:   gl.getUniformLocation(program, 'u_spiral_rotations'),
  }

  gl.uniform1i(uniforms.u_spiral_tex_primary, 1)
  gl.uniform1i(uniforms.u_spiral_tex_accent,  2)

  return { gl, uniforms }
}

const HOLO_MODE_INT:    Record<HoloMode, number>  = { none: 0, full_holo: 1, reverse_holo: 2 }
const HOLO_DENSITY_INT: Record<HoloType, number>  = { none: 0, reverse: 0, standard: 1, full_art: 2, rainbow: 3 }

export function useHoloShader(
  canvasRef: RefObject<HTMLCanvasElement>,
  opts: HoloShaderOpts,
) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = initGL(canvas)
    if (!ctx) return
    const { gl, uniforms } = ctx

    // Pre-compute spiral layout once per seedOffset (re-runs if seed changes via new effect)
    const layout = computeSpiralLayout(opts.seedOffset)
    gl.uniform2fv(uniforms.u_spiral_centres,   layout.centres)
    gl.uniform1fv(uniforms.u_spiral_scales,    layout.scales)
    gl.uniform1fv(uniforms.u_spiral_rotations, layout.rotations)

    const startTime = performance.now()
    let rafId: number

    function render() {
      const { seedOffset, artworkBounds, holoMode, holoType, pointer } = optsRef.current
      const bounds = artworkBounds ?? { x: 0, y: 0, w: 1, h: 1 }

      gl.viewport(0, 0, canvas!.width, canvas!.height)
      gl.clear(gl.COLOR_BUFFER_BIT)

      const t = (performance.now() - startTime) / 1000
      gl.uniform2f(uniforms.u_resolution,    canvas!.width, canvas!.height)
      gl.uniform2f(uniforms.u_seed_offset,   seedOffset.x, seedOffset.y)
      gl.uniform2f(uniforms.u_pointer,       pointer.x, pointer.y)
      gl.uniform1f(uniforms.u_time,          t)
      gl.uniform1i(uniforms.u_holo_mode,     HOLO_MODE_INT[holoMode])
      gl.uniform4f(uniforms.u_artwork_bounds, bounds.x, bounds.y, bounds.w, bounds.h)
      gl.uniform1i(uniforms.u_holo_density,  HOLO_DENSITY_INT[holoType])

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext()
    }
    // Re-init if seedOffset changes (new spiral layout)
  }, [canvasRef, opts.seedOffset.x, opts.seedOffset.y])
}
```

- [ ] **Step 4: Run test — verify it passes**

```
npx vitest run src/components/HoloCard/__tests__/useHoloShader.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/HoloCard/useHoloShader.ts src/components/HoloCard/__tests__/useHoloShader.test.ts
git commit -m "feat: add useHoloShader WebGL hook — spiral layout pre-computation, texture upload, rAF loop"
```

---

## Task 8: Update HoloCard Component

**Files:**
- Modify: `src/components/HoloCard/HoloCard.tsx`
- Modify: `src/components/HoloCard/HoloCard.css`
- Create: `src/components/HoloCard/__tests__/HoloCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/HoloCard/__tests__/HoloCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import HoloCard from '../HoloCard'
import type { Card } from '../../../types'

const holoCard: Card = {
  id: '1', name: 'Charizard', set: 'base1', number: '4',
  rarity: 'holo_rare', image_url: 'https://example.com/card.png',
  holo_type: 'standard', artwork_bounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

describe('HoloCard', () => {
  it('renders canvas overlay', () => {
    const { container } = render(<HoloCard card={holoCard} holoSeed={{ x: 0.3, y: 0.7 }} />)
    expect(container.querySelector('canvas.card__holo-canvas')).not.toBeNull()
  })

  it('renders canvas for none holo type', () => {
    const { container } = render(<HoloCard card={{ ...holoCard, holo_type: 'none' }} />)
    expect(container.querySelector('canvas.card__holo-canvas')).not.toBeNull()
  })

  it('renders card image', () => {
    const { container } = render(<HoloCard card={holoCard} />)
    const img = container.querySelector('img.card__img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('card.png')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
npx vitest run src/components/HoloCard/__tests__/HoloCard.test.tsx
```

Expected: FAIL — canvas not found.

- [ ] **Step 3: Read current HoloCard.tsx**

Before editing, read `src/components/HoloCard/HoloCard.tsx` in full to understand the current structure (CSS custom properties, event handlers, size variants, existing holo layers).

- [ ] **Step 4: Update HoloCard.tsx**

Minimal changes to the existing file:
1. Add `import { useState, useCallback } from 'react'` if not present
2. Add `canvasRef = useRef<HTMLCanvasElement>(null)` 
3. Add `pointer` state: `const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 })`
4. Add `holoSeed?: HoloSeed` to Props type
5. Call `useHoloShader(canvasRef, { seedOffset: holoSeed ?? {x:0.5,y:0.5}, artworkBounds: card.artwork_bounds ?? null, holoMode: deriveHoloMode(card), holoType: card.holo_type, pointer })`
6. Update `handleMouseMove` / `handleTouchMove` to also `setPointer({ x: x/rect.width, y: y/rect.height })`; reset to `{x:0.5,y:0.5}` on leave
7. Add `<canvas ref={canvasRef} className="card__holo-canvas" width={canvasDims.width} height={canvasDims.height} />` as last child of card div

`deriveHoloMode` helper:
```ts
function deriveHoloMode(card: Card): HoloMode {
  if (card.holo_type === 'reverse') return 'reverse_holo'
  if (card.holo_type === 'none')    return 'none'
  return 'full_holo'
}
```

`CANVAS_SIZES` map:
```ts
const CANVAS_SIZES = { sm: {width:120,height:167}, md: {width:200,height:279}, lg: {width:300,height:418} }
```

- [ ] **Step 5: Append to HoloCard.css**

```css
.card__holo-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
  z-index: 5;
  mix-blend-mode: color-dodge;
}
```

- [ ] **Step 6: Run test — verify it passes**

```
npx vitest run src/components/HoloCard/__tests__/HoloCard.test.tsx
```

Expected: all 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/HoloCard/HoloCard.tsx src/components/HoloCard/HoloCard.css src/components/HoloCard/__tests__/HoloCard.test.tsx
git commit -m "feat: integrate WebGL cosmo foil canvas into HoloCard component"
```

---

## Task 9: Pass holoSeed from Collection Route

**Files:**
- Modify: `src/routes/Collection.tsx`

- [ ] **Step 1: Read Collection.tsx**

Read `src/routes/Collection.tsx` in full to find every `<HoloCard` usage.

- [ ] **Step 2: Add holoSeed prop to each HoloCard**

For modal HoloCard (selectedCard is a CollectionEntry):
```tsx
<HoloCard card={selectedCard.card} size="lg" interactive={true} holoSeed={selectedCard.holo_seed ?? undefined} />
```

For grid thumbnail HoloCard:
```tsx
<HoloCard card={entry.card} size="sm" interactive={false} holoSeed={entry.holo_seed ?? undefined} />
```

- [ ] **Step 3: TypeScript check**

```
npx tsc --noEmit
```

- [ ] **Step 4: Full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Collection.tsx
git commit -m "feat: pass holo_seed from collection entries to HoloCard"
```

---

## Task 10: Populate artwork_bounds + Smoke Test

- [ ] **Step 1: Run process-holo-masks**

```
npx tsx scripts/process-holo-masks.ts
```

Expected: prints one line per card, then `Done.`

- [ ] **Step 2: Smoke test in browser**

```
npm run dev
```

Open collection. Hover holo card. Verify:
- Cosmo foil pattern appears over artwork (full holo) or card border (reverse holo)
- Pattern animates with mouse movement — hue shifts with tilt direction
- Two copies of same card with different `holo_seed` have different spiral positions
- No console WebGL errors

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "ops: populate artwork_bounds for all existing cards via process-holo-masks"
```

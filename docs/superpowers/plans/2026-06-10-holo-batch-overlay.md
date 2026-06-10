# Holo Batch Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the WebGL holo shimmer across pack-opening cards (dealing top card + summary grid) using a single shared WebGL context, built as a reusable component so the collection grid can adopt it later.

**Architecture:** One overlay `<canvas>` with one long-lived WebGL context per surface. Each animation frame, iterate the visible holo cards and draw each into its own screen rectangle via `gl.viewport` + `gl.scissor`, culling off-screen cards. Card DOM rects → GL pixel coords each frame. No per-card context, no `loseContext` (NVIDIA crash).

**Tech Stack:** React 19, TypeScript, raw WebGL (no three.js for this), Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-10-pack-opening-holo-overlay-design.md`

---

## File Structure

- `src/components/HoloCard/shaders.ts` — MODIFY: add `u_viewport_origin` uniform + UV offset.
- `src/components/HoloCard/holoGL.ts` — CREATE: shared GL init (extracted from `useHoloShader.ts`), `u_viewport_origin` added.
- `src/components/HoloCard/useHoloShader.ts` — MODIFY: consume `holoGL.ts`; set `u_viewport_origin=(0,0)`.
- `src/components/HoloCard/coords.ts` — CREATE: pure `domRectToGLRect` + `isGLRectVisible` helpers.
- `src/components/HoloCard/coords.test.ts` — CREATE: unit tests for coords.
- `src/components/HoloBatch/HoloBatchCanvas.tsx` — CREATE: reusable batch overlay component.
- `src/components/HoloBatch/HoloBatchCanvas.css` — CREATE: overlay canvas styles.
- `src/components/HoloBatch/types.ts` — CREATE: `HoloEntry` type.
- `src/components/HoloBatch/__tests__/HoloBatchCanvas.test.tsx` — CREATE: render/draw/cull tests.
- `src/components/PackRip/PackRip.tsx` — MODIFY: collect card refs, render `HoloBatchCanvas` in dealing/summary.
- `src/components/PackRip/PackRip.css` — MODIFY: overlay z-index check (no new rule unless needed).
- `src/components/PackRip/__tests__/PackRip.test.tsx` — CREATE: phase-gated overlay presence test.

---

## Task 1: Shader viewport origin uniform

**Files:**
- Modify: `src/components/HoloCard/shaders.ts`

- [ ] **Step 1: Add the uniform declaration**

In `src/components/HoloCard/shaders.ts`, inside `FRAG_SRC`, add the uniform after the `u_resolution` line:

```glsl
  uniform vec2      u_resolution;
  uniform vec2      u_viewport_origin;
```

- [ ] **Step 2: Offset the UV by the viewport origin**

Replace:

```glsl
    vec2 uv = gl_FragCoord.xy / u_resolution;
    uv.y = 1.0 - uv.y;
```

with:

```glsl
    vec2 uv = (gl_FragCoord.xy - u_viewport_origin) / u_resolution;
    uv.y = 1.0 - uv.y;
```

- [ ] **Step 3: Run the existing shader test to confirm no regression**

Run: `npm run test -- useHoloShader`
Expected: PASS (mock gl ignores the new uniform; nothing breaks).

- [ ] **Step 4: Commit**

```bash
git add src/components/HoloCard/shaders.ts
git commit -m "feat(holo): add u_viewport_origin uniform for per-card viewport UV"
```

---

## Task 2: Extract shared GL init into holoGL.ts

**Files:**
- Create: `src/components/HoloCard/holoGL.ts`
- Modify: `src/components/HoloCard/useHoloShader.ts`

- [ ] **Step 1: Create `holoGL.ts` with the shared init**

Create `src/components/HoloCard/holoGL.ts`:

```ts
// src/components/HoloCard/holoGL.ts
// Shared WebGL setup for the holo shader. Used by useHoloShader (single card)
// and HoloBatchCanvas (multi-card scissor batch). One source of GL init so the
// context cap + cosmo-bitmap upload live in one place.
import { VERT_SRC, FRAG_SRC } from './shaders'
import type { HoloMode } from '../../types'

export interface HoloShaderParams {
  brightness:       number
  lumaScale:        number
  saturation:       number
  opacity:          number
  tiltSensitivity:  number
  activationFloor:  number
}

export const DEFAULT_HOLO_PARAMS: HoloShaderParams = {
  brightness:      0.10,
  lumaScale:       0.55,
  saturation:      1.0,
  opacity:         2.0,
  tiltSensitivity: 5.2,
  activationFloor: 0.15,
}

export const HOLO_MODE_INT: Record<HoloMode, number> = {
  none: 0, full_holo: 1, reverse_holo: 2, subject_holo: 1,
}

// Module-level bitmap preload — one Image shared across all card instances.
const cosmoImg = new Image()
cosmoImg.src = '/textures/cosmo-bitmap.png'

let activeContextCount = 0
const MAX_CONTEXTS = 16
let webglBroken = false

export function getActiveContextCount() { return activeContextCount }
export function releaseContext() { activeContextCount = Math.max(0, activeContextCount - 1) }
export function resetWebglBroken() { webglBroken = false }

export type Uniforms = {
  u_resolution:       WebGLUniformLocation | null
  u_viewport_origin:  WebGLUniformLocation | null
  u_seed_offset:      WebGLUniformLocation | null
  u_pointer:          WebGLUniformLocation | null
  u_holo_mode:        WebGLUniformLocation | null
  u_artwork_bounds:   WebGLUniformLocation | null
  u_cosmo_bitmap:     WebGLUniformLocation | null
  u_brightness:       WebGLUniformLocation | null
  u_luma_scale:       WebGLUniformLocation | null
  u_saturation:       WebGLUniformLocation | null
  u_opacity:          WebGLUniformLocation | null
  u_tilt_sensitivity: WebGLUniformLocation | null
  u_activation_floor: WebGLUniformLocation | null
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[HoloShader] compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function uploadBitmapTexture(gl: WebGLRenderingContext, unit: number): WebGLTexture | null {
  gl.activeTexture(gl.TEXTURE0 + unit)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  function upload() {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cosmoImg)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  if (cosmoImg.complete && cosmoImg.naturalWidth > 0) {
    upload()
  } else {
    const handler = () => { upload(); cosmoImg.removeEventListener('load', handler) }
    cosmoImg.addEventListener('load', handler)
  }
  return tex
}

// Initialises a WebGL context on `canvas`, compiles the holo program, uploads the
// cosmo bitmap, and returns the gl handle + uniform locations. Returns null (and
// hides nothing — caller decides) when the context cap is hit or GL is unavailable.
export function initHoloGL(canvas: HTMLCanvasElement): { gl: WebGLRenderingContext; uniforms: Uniforms } | null {
  if (webglBroken) return null
  if (activeContextCount >= MAX_CONTEXTS) {
    console.warn(`[HoloShader] context cap (${MAX_CONTEXTS}) reached`)
    return null
  }
  const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
  if (!gl) return null

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  if (!vert || !frag) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    webglBroken = true
    return null
  }

  const program = gl.createProgram()
  if (!program) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null }
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[HoloShader] link error:', gl.getProgramInfoLog(program))
    gl.deleteShader(vert)
    gl.deleteShader(frag)
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

  uploadBitmapTexture(gl, 1)

  const uniforms: Uniforms = {
    u_resolution:       gl.getUniformLocation(program, 'u_resolution'),
    u_viewport_origin:  gl.getUniformLocation(program, 'u_viewport_origin'),
    u_seed_offset:      gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:          gl.getUniformLocation(program, 'u_pointer'),
    u_holo_mode:        gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds:   gl.getUniformLocation(program, 'u_artwork_bounds'),
    u_cosmo_bitmap:     gl.getUniformLocation(program, 'u_cosmo_bitmap'),
    u_brightness:       gl.getUniformLocation(program, 'u_brightness'),
    u_luma_scale:       gl.getUniformLocation(program, 'u_luma_scale'),
    u_saturation:       gl.getUniformLocation(program, 'u_saturation'),
    u_opacity:          gl.getUniformLocation(program, 'u_opacity'),
    u_tilt_sensitivity: gl.getUniformLocation(program, 'u_tilt_sensitivity'),
    u_activation_floor: gl.getUniformLocation(program, 'u_activation_floor'),
  }
  gl.uniform1i(uniforms.u_cosmo_bitmap, 1)

  activeContextCount++
  return { gl, uniforms }
}
```

- [ ] **Step 2: Rewrite `useHoloShader.ts` to use the shared init**

Replace the entire contents of `src/components/HoloCard/useHoloShader.ts` with:

```ts
// src/components/HoloCard/useHoloShader.ts
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { ArtworkBounds, HoloMode, HoloSeed } from '../../types'
import {
  initHoloGL, releaseContext, resetWebglBroken,
  DEFAULT_HOLO_PARAMS, HOLO_MODE_INT,
  type HoloShaderParams,
} from './holoGL'

export type { HoloShaderParams } from './holoGL'
export { DEFAULT_HOLO_PARAMS } from './holoGL'

interface HoloShaderOpts {
  enabled:       boolean
  seedOffset:    HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode:      HoloMode
  pointer:       { x: number; y: number }
  params?:       HoloShaderParams
}

export function useHoloShader(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: HoloShaderOpts,
) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!opts.enabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    resetWebglBroken()
    canvas.style.removeProperty('display')
    const ctx = initHoloGL(canvas)
    if (!ctx) {
      canvas.style.setProperty('display', 'none', 'important')
      return
    }

    const { gl, uniforms } = ctx
    let rafId: number

    function render() {
      const { seedOffset, artworkBounds, holoMode, pointer, params } = optsRef.current
      const bounds = artworkBounds ?? { x: 0, y: 0, w: 1, h: 1 }
      const p = { ...DEFAULT_HOLO_PARAMS, ...params }

      const dpr = window.devicePixelRatio || 1
      const displayW = Math.round(canvas!.clientWidth  * dpr)
      const displayH = Math.round(canvas!.clientHeight * dpr)
      if (canvas!.width !== displayW || canvas!.height !== displayH) {
        canvas!.width  = displayW
        canvas!.height = displayH
      }

      gl.viewport(0, 0, canvas!.width, canvas!.height)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform2f(uniforms.u_resolution,      canvas!.width, canvas!.height)
      gl.uniform2f(uniforms.u_viewport_origin, 0, 0)
      gl.uniform2f(uniforms.u_seed_offset,     seedOffset.x, seedOffset.y)
      gl.uniform2f(uniforms.u_pointer,         pointer.x, pointer.y)
      gl.uniform1i(uniforms.u_holo_mode,       HOLO_MODE_INT[holoMode])
      gl.uniform4f(uniforms.u_artwork_bounds,  bounds.x, bounds.y, bounds.w, bounds.h)
      gl.uniform1f(uniforms.u_brightness,        p.brightness)
      gl.uniform1f(uniforms.u_luma_scale,         p.lumaScale)
      gl.uniform1f(uniforms.u_saturation,         p.saturation)
      gl.uniform1f(uniforms.u_opacity,            p.opacity)
      gl.uniform1f(uniforms.u_tilt_sensitivity,   p.tiltSensitivity)
      gl.uniform1f(uniforms.u_activation_floor,   p.activationFloor)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      releaseContext()
    }
  }, [canvasRef, opts.seedOffset.x, opts.seedOffset.y, opts.enabled])
}
```

- [ ] **Step 3: Run the holo tests to verify no regression**

Run: `npm run test -- useHoloShader HoloCard`
Expected: PASS. (The test mocks `getUniformLocation` → returns `{}`; new `u_viewport_origin` resolves fine.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/HoloCard/holoGL.ts src/components/HoloCard/useHoloShader.ts
git commit -m "refactor(holo): extract shared GL init into holoGL.ts"
```

---

## Task 3: Pure coordinate helpers

**Files:**
- Create: `src/components/HoloCard/coords.ts`
- Test: `src/components/HoloCard/coords.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/HoloCard/coords.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { domRectToGLRect, isGLRectVisible } from './coords'

type R = { left: number; top: number; width: number; height: number }
const rect = (left: number, top: number, width: number, height: number): R => ({ left, top, width, height })

describe('domRectToGLRect', () => {
  // canvas 200x400 css px, dpr 1, canvas pixel height 400
  it('flips Y so DOM top-left maps to GL bottom-left origin', () => {
    const canvasRect = rect(0, 0, 200, 400)
    // a card at top of canvas: DOM top=0, height=100 -> GL y = 400 - (0+100) = 300
    const r = domRectToGLRect(rect(0, 0, 50, 100), canvasRect, 400, 1)
    expect(r).toEqual({ x: 0, y: 300, w: 50, h: 100 })
  })

  it('offsets by the canvas origin', () => {
    const canvasRect = rect(20, 10, 200, 400)
    // card DOM left=70 -> rel 50; top=110 -> rel 100 -> GL y = 400-(100+100)=200
    const r = domRectToGLRect(rect(70, 110, 60, 100), canvasRect, 400, 1)
    expect(r).toEqual({ x: 50, y: 200, w: 60, h: 100 })
  })

  it('scales by dpr', () => {
    const canvasRect = rect(0, 0, 200, 400)
    // dpr 2 -> canvas pixel height 800; card top=0 h=100 -> GL y = 800-(0+200)=600
    const r = domRectToGLRect(rect(0, 0, 50, 100), canvasRect, 800, 2)
    expect(r).toEqual({ x: 0, y: 600, w: 100, h: 200 })
  })
})

describe('isGLRectVisible', () => {
  // canvas pixel size 200x400
  it('true when overlapping the canvas', () => {
    expect(isGLRectVisible({ x: 10, y: 10, w: 50, h: 50 }, 200, 400)).toBe(true)
  })
  it('false when fully left/below origin', () => {
    expect(isGLRectVisible({ x: -100, y: 10, w: 50, h: 50 }, 200, 400)).toBe(false)
    expect(isGLRectVisible({ x: 10, y: -100, w: 50, h: 50 }, 200, 400)).toBe(false)
  })
  it('false when fully past the far edges', () => {
    expect(isGLRectVisible({ x: 250, y: 10, w: 50, h: 50 }, 200, 400)).toBe(false)
    expect(isGLRectVisible({ x: 10, y: 450, w: 50, h: 50 }, 200, 400)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- coords`
Expected: FAIL ("Failed to resolve import './coords'" / functions not defined).

- [ ] **Step 3: Implement the helpers**

Create `src/components/HoloCard/coords.ts`:

```ts
// src/components/HoloCard/coords.ts
// Pure geometry helpers shared by HoloBatchCanvas. Kept side-effect free so they
// unit-test without a DOM or GL context.

export interface GLRect { x: number; y: number; w: number; h: number }
interface RectLike { left: number; top: number; width: number; height: number }

// Convert a card's viewport-relative DOM rect into GL pixel coordinates for the
// overlay canvas. DOM is top-left / y-down; GL viewport is bottom-left / y-up.
// `canvasPxHeight` is the canvas backing-store height (css height * dpr).
export function domRectToGLRect(
  cardRect: RectLike,
  canvasRect: RectLike,
  canvasPxHeight: number,
  dpr: number,
): GLRect {
  const relLeft = cardRect.left - canvasRect.left
  const relTop  = cardRect.top  - canvasRect.top
  const w = cardRect.width  * dpr
  const h = cardRect.height * dpr
  const x = relLeft * dpr
  const y = canvasPxHeight - (relTop * dpr + h)
  return { x, y, w, h }
}

// True if any part of the GL rect lies within the canvas backing store.
export function isGLRectVisible(r: GLRect, canvasPxWidth: number, canvasPxHeight: number): boolean {
  return r.x + r.w > 0 && r.x < canvasPxWidth && r.y + r.h > 0 && r.y < canvasPxHeight
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- coords`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/components/HoloCard/coords.ts src/components/HoloCard/coords.test.ts
git commit -m "feat(holo): pure domRectToGLRect + isGLRectVisible helpers"
```

---

## Task 4: HoloEntry type + HoloBatchCanvas component

**Files:**
- Create: `src/components/HoloBatch/types.ts`
- Create: `src/components/HoloBatch/HoloBatchCanvas.tsx`
- Create: `src/components/HoloBatch/HoloBatchCanvas.css`
- Test: `src/components/HoloBatch/__tests__/HoloBatchCanvas.test.tsx`

- [ ] **Step 1: Create the entry type**

Create `src/components/HoloBatch/types.ts`:

```ts
// src/components/HoloBatch/types.ts
import type { Card, HoloSeed } from '../../types'

// One card opted into the batch holo overlay. `el` is the card's DOM element whose
// on-screen rect the overlay tracks each frame; null entries are skipped.
export interface HoloEntry {
  id: string
  el: HTMLElement | null
  card: Card
  seed: HoloSeed
}
```

- [ ] **Step 2: Write the failing test**

Create `src/components/HoloBatch/__tests__/HoloBatchCanvas.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import HoloBatchCanvas from '../HoloBatchCanvas'
import type { HoloEntry } from '../types'
import type { Card } from '../../../types'

const makeGLMock = () => ({
  createShader: vi.fn(() => ({})), shaderSource: vi.fn(), compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true), getShaderInfoLog: vi.fn(() => ''),
  createProgram: vi.fn(() => ({})), attachShader: vi.fn(), linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true), getProgramInfoLog: vi.fn(() => ''),
  useProgram: vi.fn(), createBuffer: vi.fn(() => ({})), bindBuffer: vi.fn(),
  bufferData: vi.fn(), getAttribLocation: vi.fn(() => 0), enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(), enable: vi.fn(), disable: vi.fn(), blendFunc: vi.fn(),
  getUniformLocation: vi.fn(() => ({})), viewport: vi.fn(), scissor: vi.fn(),
  clear: vi.fn(), clearColor: vi.fn(), uniform2f: vi.fn(), uniform1f: vi.fn(),
  uniform1i: vi.fn(), uniform4f: vi.fn(), drawArrays: vi.fn(),
  getExtension: vi.fn(() => null), deleteShader: vi.fn(),
  createTexture: vi.fn(() => ({})), activeTexture: vi.fn(), bindTexture: vi.fn(),
  texImage2D: vi.fn(), texParameteri: vi.fn(),
  COLOR_BUFFER_BIT: 0x4000, VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30,
  COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82, ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88B4, FLOAT: 0x1406, TRIANGLES: 0x0004, BLEND: 0x0BE2,
  SCISSOR_TEST: 0x0C11, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303,
  TEXTURE0: 0x84C0, TEXTURE_2D: 0x0DE1, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401,
  TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812F,
})

const card = (id: string): Card => ({
  id, name: 'Test', set: 's', number: '1', rarity: 'common',
  image_url: '', holo_type: 'standard',
  artwork_bounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
} as Card)

describe('HoloBatchCanvas', () => {
  let glMock: ReturnType<typeof makeGLMock>

  beforeEach(() => {
    glMock = makeGLMock()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(glMock as any)
    // Canvas covers a 200x400 viewport box at origin.
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON() {} } as DOMRect)
  })

  function entryWithRect(id: string, r: { left: number; top: number; width: number; height: number }): HoloEntry {
    const el = document.createElement('div')
    el.getBoundingClientRect = () =>
      ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect)
    return { id, el, card: card(id), seed: { x: 0.3, y: 0.6 } }
  }

  it('draws one quad per on-screen entry', async () => {
    const entries = [
      entryWithRect('a', { left: 10, top: 10, width: 50, height: 70 }),
      entryWithRect('b', { left: 80, top: 10, width: 50, height: 70 }),
    ]
    render(<HoloBatchCanvas entries={entries} pointer={{ x: 0.5, y: 0.5 }} />)
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).toHaveBeenCalledTimes(2)
  })

  it('culls entries fully outside the canvas', async () => {
    const entries = [
      entryWithRect('a', { left: 10, top: 10, width: 50, height: 70 }),
      entryWithRect('off', { left: 9000, top: 9000, width: 50, height: 70 }),
    ]
    render(<HoloBatchCanvas entries={entries} pointer={{ x: 0.5, y: 0.5 }} />)
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).toHaveBeenCalledTimes(1)
  })

  it('skips entries with a null el', async () => {
    const entries: HoloEntry[] = [
      { id: 'n', el: null, card: card('n'), seed: { x: 0, y: 0 } },
    ]
    render(<HoloBatchCanvas entries={entries} pointer={{ x: 0.5, y: 0.5 }} />)
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).not.toHaveBeenCalled()
  })

  it('does not throw when WebGL is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() =>
      render(<HoloBatchCanvas entries={[]} pointer={{ x: 0.5, y: 0.5 }} />)
    ).not.toThrow()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test -- HoloBatchCanvas`
Expected: FAIL ("Failed to resolve import '../HoloBatchCanvas'").

- [ ] **Step 4: Implement the component**

Create `src/components/HoloBatch/HoloBatchCanvas.tsx`:

```tsx
// src/components/HoloBatch/HoloBatchCanvas.tsx
import { useEffect, useRef } from 'react'
import {
  initHoloGL, releaseContext, resetWebglBroken,
  DEFAULT_HOLO_PARAMS, HOLO_MODE_INT,
} from '../HoloCard/holoGL'
import { domRectToGLRect, isGLRectVisible } from '../HoloCard/coords'
import { deriveHoloMode } from '../HoloCard/HoloCard'
import type { HoloEntry } from './types'
import './HoloBatchCanvas.css'

interface Props {
  entries: HoloEntry[]
  pointer: { x: number; y: number }
  // `fixed` positions the canvas against the viewport (for scrolling surfaces like
  // the collection grid). Default false = absolute, covers the nearest positioned
  // ancestor (pack opening, which does not scroll).
  fixed?: boolean
}

export default function HoloBatchCanvas({ entries, pointer, fixed = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const entriesRef = useRef(entries)
  const pointerRef = useRef(pointer)
  entriesRef.current = entries
  pointerRef.current = pointer

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resetWebglBroken()
    const ctx = initHoloGL(canvas)
    if (!ctx) {
      canvas.style.setProperty('display', 'none', 'important')
      return
    }
    const { gl, uniforms } = ctx
    gl.enable(gl.SCISSOR_TEST)
    let rafId: number

    function render() {
      const dpr = window.devicePixelRatio || 1
      const canvasRect = canvas!.getBoundingClientRect()
      const pxW = Math.round(canvasRect.width  * dpr)
      const pxH = Math.round(canvasRect.height * dpr)
      if (canvas!.width !== pxW || canvas!.height !== pxH) {
        canvas!.width  = pxW
        canvas!.height = pxH
      }

      // Clear the whole canvas (scissor must be disabled for a full clear).
      gl.disable(gl.SCISSOR_TEST)
      gl.viewport(0, 0, pxW, pxH)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.SCISSOR_TEST)

      const p = DEFAULT_HOLO_PARAMS
      const ptr = pointerRef.current

      for (const entry of entriesRef.current) {
        if (!entry.el) continue
        const card = entry.card
        const bounds = card.artwork_bounds ?? null
        const holoMode = bounds ? deriveHoloMode(card) : 'none'
        if (holoMode === 'none' || !bounds) continue

        const r = domRectToGLRect(entry.el.getBoundingClientRect(), canvasRect, pxH, dpr)
        if (!isGLRectVisible(r, pxW, pxH)) continue

        gl.viewport(r.x, r.y, r.w, r.h)
        gl.scissor(r.x, r.y, r.w, r.h)

        gl.uniform2f(uniforms.u_resolution,      r.w, r.h)
        gl.uniform2f(uniforms.u_viewport_origin, r.x, r.y)
        gl.uniform2f(uniforms.u_seed_offset,     entry.seed.x, entry.seed.y)
        gl.uniform2f(uniforms.u_pointer,         ptr.x, ptr.y)
        gl.uniform1i(uniforms.u_holo_mode,       HOLO_MODE_INT[holoMode])
        gl.uniform4f(uniforms.u_artwork_bounds,  bounds.x, bounds.y, bounds.w, bounds.h)
        gl.uniform1f(uniforms.u_brightness,        p.brightness)
        gl.uniform1f(uniforms.u_luma_scale,         p.lumaScale)
        gl.uniform1f(uniforms.u_saturation,         p.saturation)
        gl.uniform1f(uniforms.u_opacity,            p.opacity)
        gl.uniform1f(uniforms.u_tilt_sensitivity,   p.tiltSensitivity)
        gl.uniform1f(uniforms.u_activation_floor,   p.activationFloor)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      releaseContext()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`holo-batch-canvas${fixed ? ' holo-batch-canvas--fixed' : ''}`}
    />
  )
}
```

- [ ] **Step 5: Create the CSS**

Create `src/components/HoloBatch/HoloBatchCanvas.css`:

```css
.holo-batch-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5; /* above .card__img, below progress/hint/actions chrome */
}

.holo-batch-canvas--fixed {
  position: fixed;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- HoloBatchCanvas`
Expected: PASS (4 tests). RAF in jsdom: the setup runs one frame via the timeout; if `requestAnimationFrame` is not polyfilled in jsdom it falls back to throwing — confirm `src/__tests__/setup.ts` provides it; if not, the component still calls `render()` once synchronously before scheduling, so `drawArrays` is already invoked.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/HoloBatch/
git commit -m "feat(holo): reusable HoloBatchCanvas scissor-batch overlay"
```

---

## Task 5: Wire HoloBatchCanvas into PackRip

**Files:**
- Modify: `src/components/PackRip/PackRip.tsx`
- Test: `src/components/PackRip/__tests__/PackRip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/PackRip/__tests__/PackRip.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PackRip from '../PackRip'
import type { Card } from '../../../types'

// Stub the 3D scene (r3f Canvas can't run in jsdom). Expose a button that fires
// onTornAway so the test can advance from the 'pack' phase to 'dealing'.
vi.mock('../pack3d/PackTearScene', () => ({
  default: ({ onTornAway, onReady }: { onTornAway: () => void; onReady?: () => void }) => {
    onReady?.()
    return <button data-testid="tear" onClick={onTornAway}>tear</button>
  },
}))

// Stub the overlay so we only assert on its presence, not WebGL.
vi.mock('../../HoloBatch/HoloBatchCanvas', () => ({
  default: () => <div data-testid="holo-batch" />,
}))

const card = (id: string): Card => ({
  id, name: id, set: 's', number: id, rarity: 'common',
  image_url: '', holo_type: 'standard',
  artwork_bounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
} as Card)

const cards = [card('a'), card('b'), card('c')]

function renderPack() {
  return render(
    <MemoryRouter>
      <PackRip packImageUrl="" cards={cards} onComplete={() => {}} />
    </MemoryRouter>
  )
}

describe('PackRip holo overlay', () => {
  it('does not render the overlay during the pack phase', () => {
    renderPack()
    expect(screen.queryByTestId('holo-batch')).toBeNull()
  })

  it('renders the overlay once dealing starts', async () => {
    renderPack()
    screen.getByTestId('tear').click()
    expect(await screen.findByTestId('holo-batch')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- PackRip`
Expected: FAIL (overlay never rendered → second test fails finding `holo-batch`).

- [ ] **Step 3: Add overlay state + pointer tracking to PackRip**

In `src/components/PackRip/PackRip.tsx`, add the import near the other imports:

```tsx
import HoloBatchCanvas from '../HoloBatch/HoloBatchCanvas'
import type { HoloEntry } from '../HoloBatch/types'
```

Add a pointer ref and a summary-slot ref map alongside the existing refs (after `mountedRef`):

```tsx
  const pointerRef = useRef({ x: 0.5, y: 0.5 })
  const summarySlotsRef = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const [, forceTick] = useState(0)
```

> Note: `forceTick` exists only to re-render once refs attach so the overlay picks
> up `topCardRef.current` / summary slots on the first frame; the RAF loop reads
> live rects each frame thereafter.

- [ ] **Step 4: Track the pointer on the deck and build entries**

In `handleCardPointerMove`, after the existing `setDragState({ dx, dy })`, also update the pointer ref from the event position relative to the top card so tilt tracks the drag:

```tsx
  function handleCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current || flying) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setDragState({ dx, dy })
    const el = topCardRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      pointerRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      }
    }
  }
```

Add a `useEffect` to force one re-render after mount so refs are populated (place after the existing `mountedRef` effect):

```tsx
  useEffect(() => { forceTick(t => t + 1) }, [phase, deckIndex])
```

Build the entries list before the `return` (after the `isCommitting` line):

```tsx
  const holoEntries: HoloEntry[] = phase === 'dealing'
    ? (cards[deckIndex]
        ? [{ id: `top-${deckIndex}`, el: topCardRef.current, card: cards[deckIndex], seed: { x: 0.5, y: 0.5 } }]
        : [])
    : phase === 'summary'
      ? cards.map((c, i) => ({
          id: `sum-${c.id}-${i}`,
          el: summarySlotsRef.current.get(`${c.id}-${i}`) ?? null,
          card: c,
          seed: { x: 0.5, y: 0.5 },
        }))
      : []
```

- [ ] **Step 5: Attach the summary slot refs and render the overlay**

In the summary map, add a `ref` callback to each `pack-rip__card-slot`:

```tsx
              <div
                key={card.id + i}
                ref={el => { summarySlotsRef.current.set(`${card.id}-${i}`, el) }}
                className={[
```

Render the overlay just before the closing `</div>` of `.pack-rip` (right after the `{burst && ...}` line):

```tsx
      {(phase === 'dealing' || phase === 'summary') && (
        <HoloBatchCanvas entries={holoEntries} pointer={pointerRef.current} />
      )}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- PackRip`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full suite + type-check**

Run: `npm run test`
Run: `npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/PackRip/PackRip.tsx src/components/PackRip/__tests__/PackRip.test.tsx
git commit -m "feat(pack): batch holo overlay on dealing + summary cards"
```

---

## Task 6: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run the preview workflow on port 5173 (kill any existing first). Open the Shop, buy a pack, rip it.

- [ ] **Step 2: Verify behavior**

Confirm:
- During the pack-tear phase: only the 3D pack renders (no flash of holo).
- During dealing: the top card shimmers; tilt tracks the drag.
- In the summary grid: every holo card shimmers simultaneously.
- Open 3–4 packs back-to-back. Open DevTools console: no `[HoloShader] context cap` warning, no WebGL context-loss warning, no white-page crash.

- [ ] **Step 3: Confirm z-index layering**

The shimmer sits over the card image but under the progress text, hint, and action buttons. If the canvas covers the buttons, lower `.holo-batch-canvas` z-index in `HoloBatchCanvas.css` below `.pack-rip__actions` and re-verify.

---

## Notes for the Collection follow-up (not this plan)
`HoloBatchCanvas` is reusable: render `<HoloBatchCanvas fixed entries={...} pointer={...} />` over the collection scroll container, collect grid slot refs into `entries`, share one pointer. The `lg` modal card keeps its own `useHoloShader`. See spec §Follow-up.

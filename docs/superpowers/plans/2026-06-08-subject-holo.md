# Subject-Traced Holo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `subject_holo` shader mode that hard-clips the cosmo shimmer to a card's Pokémon silhouette, using the pixel-accurate `subject_layer_url` masks produced by `scripts/process-card-layers.ts` for 81 neo1 cards.

**Architecture:** Extend the existing `HoloMode` union with `'subject_holo'`, derive it in `HoloCard.deriveHoloMode` when a qualifying card has `subject_layer_url`, lazy-load that PNG as a second WebGL texture (mirroring the existing `cosmoImg` shared-preload pattern, cached per-URL), and multiply its alpha into the shader's existing two-layer shimmer output for a soft, antialiased silhouette clip.

**Tech Stack:** TypeScript, React 19, raw WebGL (no Three.js), Vitest + React Testing Library, GLSL ES 1.00

---

## Spec

See `docs/superpowers/specs/2026-06-08-subject-holo-design.md` for full design rationale.

---

### Task 1: Extend types for subject/bg layer URLs and the new holo mode

**Files:**
- Modify: `src/types.ts:13` (HoloMode union)
- Modify: `src/types.ts:38` (Card type — add fields after `holo_seed`)

- [ ] **Step 1: Add `subject_holo` to the `HoloMode` union**

In `src/types.ts`, change:

```ts
export type HoloMode = 'none' | 'full_holo' | 'reverse_holo'
```

to:

```ts
export type HoloMode = 'none' | 'full_holo' | 'reverse_holo' | 'subject_holo'
```

- [ ] **Step 2: Add `subject_layer_url`/`bg_layer_url` to the `Card` type**

In `src/types.ts`, find this block inside the `Card` type:

```ts
  artwork_bounds?: ArtworkBounds | null
  holo_seed?: HoloSeed | null
  supertype?: string | null
```

Change it to:

```ts
  artwork_bounds?: ArtworkBounds | null
  holo_seed?: HoloSeed | null
  subject_layer_url?: string | null
  bg_layer_url?: string | null
  supertype?: string | null
```

- [ ] **Step 3: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors (the `HoloMode` union widening and optional `Card` fields are additive)

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(holo): add subject_holo mode and layer URL fields to types"
```

---

### Task 2: Load subject mask PNG as a WebGL texture in `useHoloShader`

**Files:**
- Modify: `src/components/HoloCard/useHoloShader.ts`
- Test: `src/components/HoloCard/__tests__/useHoloShader.test.ts`

This task makes the hook accept a `subjectMaskUrl` option, lazy-loads and caches that image by URL (mirroring the existing `cosmoImg` module-level preload), uploads it to texture unit 2 per GL context, and exposes it to the shader as `u_subject_mask`.

- [ ] **Step 1: Write the failing test**

In `src/components/HoloCard/__tests__/useHoloShader.test.ts`, add `subjectMaskUrl: null,` to the three existing `useHoloShader(...)` option objects (in the tests `'initialises WebGL and calls drawArrays'`, `'does not throw when canvas ref is null'`, and `'does not throw when WebGL is unavailable'`) — the interface will soon require it. Then add this new test at the end of the `describe('useHoloShader', ...)` block, just before the closing `})`:

```ts
  it('uploads subject mask texture to unit 2 when subjectMaskUrl provided', async () => {
    renderHook(() => {
      const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
      useHoloShader(canvasRef, {
        enabled: true,
        seedOffset: { x: 0.3, y: 0.7 },
        artworkBounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
        holoMode: 'subject_holo',
        pointer: { x: 0.5, y: 0.5 },
        subjectMaskUrl: 'https://example.com/subject.png',
      })
      return canvasRef
    })
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.getUniformLocation).toHaveBeenCalledWith(expect.anything(), 'u_subject_mask')
    expect(glMock.activeTexture).toHaveBeenCalledWith(glMock.TEXTURE0 + 2)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/HoloCard/__tests__/useHoloShader.test.ts`
Expected: FAIL — `subjectMaskUrl` does not exist on type `HoloShaderOpts` (TS error) and/or `u_subject_mask` uniform never requested

- [ ] **Step 3: Add `subjectMaskUrl` to `HoloShaderOpts`**

In `src/components/HoloCard/useHoloShader.ts`, change:

```ts
interface HoloShaderOpts {
  enabled:       boolean
  seedOffset:    HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode:      HoloMode
  pointer:       { x: number; y: number }
}
```

to:

```ts
interface HoloShaderOpts {
  enabled:        boolean
  seedOffset:     HoloSeed
  artworkBounds:  ArtworkBounds | null
  holoMode:       HoloMode
  pointer:        { x: number; y: number }
  subjectMaskUrl: string | null
}
```

- [ ] **Step 4: Add a per-URL subject mask image cache**

In `src/components/HoloCard/useHoloShader.ts`, change:

```ts
// Module-level bitmap preload — one Image shared across all card instances
const cosmoImg = new Image()
cosmoImg.src = '/textures/cosmo-bitmap.png'
```

to:

```ts
// Module-level bitmap preload — one Image shared across all card instances
const cosmoImg = new Image()
cosmoImg.src = '/textures/cosmo-bitmap.png'

// Subject mask images cached by URL — repeat instances of the same card reuse the decoded image
const subjectMaskCache = new Map<string, HTMLImageElement>()

function getSubjectMaskImage(url: string): HTMLImageElement {
  let img = subjectMaskCache.get(url)
  if (!img) {
    img = new Image()
    img.src = url
    subjectMaskCache.set(url, img)
  }
  return img
}
```

- [ ] **Step 5: Generalize `uploadBitmapTexture` into `uploadImageTexture` so it can upload any cached `<img>`, not just the cosmo bitmap**

In `src/components/HoloCard/useHoloShader.ts`, replace the entire `uploadBitmapTexture` function:

```ts
function uploadBitmapTexture(gl: WebGLRenderingContext, unit: number): WebGLTexture | null {
  gl.activeTexture(gl.TEXTURE0 + unit)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)

  // 1×1 transparent placeholder while the image loads
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  function upload() {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cosmoImg)
    // NPOT texture — no mipmaps, must clamp
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
```

with:

```ts
function uploadImageTexture(gl: WebGLRenderingContext, unit: number, img: HTMLImageElement): WebGLTexture | null {
  gl.activeTexture(gl.TEXTURE0 + unit)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)

  // 1×1 transparent placeholder while the image loads
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  function upload() {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    // NPOT texture — no mipmaps, must clamp
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  if (img.complete && img.naturalWidth > 0) {
    upload()
  } else {
    const handler = () => { upload(); img.removeEventListener('load', handler) }
    img.addEventListener('load', handler)
  }

  return tex
}
```

- [ ] **Step 6: Add `u_subject_mask` to the `Uniforms` type**

In `src/components/HoloCard/useHoloShader.ts`, change:

```ts
type Uniforms = {
  u_resolution:     WebGLUniformLocation | null
  u_seed_offset:    WebGLUniformLocation | null
  u_pointer:        WebGLUniformLocation | null
  u_holo_mode:      WebGLUniformLocation | null
  u_artwork_bounds: WebGLUniformLocation | null
  u_cosmo_bitmap:   WebGLUniformLocation | null
}
```

to:

```ts
type Uniforms = {
  u_resolution:     WebGLUniformLocation | null
  u_seed_offset:    WebGLUniformLocation | null
  u_pointer:        WebGLUniformLocation | null
  u_holo_mode:      WebGLUniformLocation | null
  u_artwork_bounds: WebGLUniformLocation | null
  u_cosmo_bitmap:   WebGLUniformLocation | null
  u_subject_mask:   WebGLUniformLocation | null
}
```

- [ ] **Step 7: Thread `subjectMaskUrl` through `initGL` and upload the mask texture on unit 2**

In `src/components/HoloCard/useHoloShader.ts`, change the `initGL` signature:

```ts
function initGL(canvas: HTMLCanvasElement): { gl: WebGLRenderingContext; uniforms: Uniforms } | null {
```

to:

```ts
function initGL(canvas: HTMLCanvasElement, subjectMaskUrl: string | null): { gl: WebGLRenderingContext; uniforms: Uniforms } | null {
```

Then change this block (texture upload + uniform lookup + cosmo bitmap binding):

```ts
  uploadBitmapTexture(gl, 1)

  const uniforms: Uniforms = {
    u_resolution:     gl.getUniformLocation(program, 'u_resolution'),
    u_seed_offset:    gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:        gl.getUniformLocation(program, 'u_pointer'),
    u_holo_mode:      gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds: gl.getUniformLocation(program, 'u_artwork_bounds'),
    u_cosmo_bitmap:   gl.getUniformLocation(program, 'u_cosmo_bitmap'),
  }

  gl.uniform1i(uniforms.u_cosmo_bitmap, 1)

  activeContextCount++
  return { gl, uniforms }
}
```

to:

```ts
  uploadImageTexture(gl, 1, cosmoImg)
  if (subjectMaskUrl) {
    uploadImageTexture(gl, 2, getSubjectMaskImage(subjectMaskUrl))
  }

  const uniforms: Uniforms = {
    u_resolution:     gl.getUniformLocation(program, 'u_resolution'),
    u_seed_offset:    gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:        gl.getUniformLocation(program, 'u_pointer'),
    u_holo_mode:      gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds: gl.getUniformLocation(program, 'u_artwork_bounds'),
    u_cosmo_bitmap:   gl.getUniformLocation(program, 'u_cosmo_bitmap'),
    u_subject_mask:   gl.getUniformLocation(program, 'u_subject_mask'),
  }

  gl.uniform1i(uniforms.u_cosmo_bitmap, 1)
  if (subjectMaskUrl) gl.uniform1i(uniforms.u_subject_mask, 2)

  activeContextCount++
  return { gl, uniforms }
}
```

- [ ] **Step 8: Add `subject_holo` to `HOLO_MODE_INT` and pass `subjectMaskUrl` into `initGL`**

In `src/components/HoloCard/useHoloShader.ts`, change:

```ts
const HOLO_MODE_INT: Record<HoloMode, number> = { none: 0, full_holo: 1, reverse_holo: 2 }
```

to:

```ts
const HOLO_MODE_INT: Record<HoloMode, number> = { none: 0, full_holo: 1, reverse_holo: 2, subject_holo: 3 }
```

Then change the `initGL` call site:

```ts
    const ctx = initGL(canvas)
```

to:

```ts
    const ctx = initGL(canvas, opts.subjectMaskUrl)
```

- [ ] **Step 9: Add `opts.subjectMaskUrl` to the effect's dependency array**

In `src/components/HoloCard/useHoloShader.ts`, change:

```ts
  }, [canvasRef, opts.seedOffset.x, opts.seedOffset.y, opts.enabled])
```

to:

```ts
  }, [canvasRef, opts.seedOffset.x, opts.seedOffset.y, opts.enabled, opts.subjectMaskUrl])
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run src/components/HoloCard/__tests__/useHoloShader.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 11: Commit**

```bash
git add src/components/HoloCard/useHoloShader.ts src/components/HoloCard/__tests__/useHoloShader.test.ts
git commit -m "feat(holo): load subject mask PNG as texture unit 2 in useHoloShader"
```

---

### Task 3: Sample the subject mask in the fragment shader for `subject_holo` mode

**Files:**
- Modify: `src/components/HoloCard/shaders.ts`

No isolated unit test is practical for a GLSL source string — this is verified indirectly by Task 2's `useHoloShader` test (uniform wiring) and directly by the manual smoke test in Task 5.

- [ ] **Step 1: Add the `u_subject_mask` sampler uniform**

In `src/components/HoloCard/shaders.ts`, change:

```glsl
  uniform sampler2D u_cosmo_bitmap;
```

to:

```glsl
  uniform sampler2D u_cosmo_bitmap;
  uniform sampler2D u_subject_mask;
```

- [ ] **Step 2: Multiply the subject mask alpha into the shimmer output for mode 3**

In `src/components/HoloCard/shaders.ts`, change the end of `main()`:

```glsl
      float a = luma * activation;
      col   = max(col, layerCol * a);
      alpha = max(alpha, a);
    }

    gl_FragColor = vec4(col, alpha);
  }
```

to:

```glsl
      float a = luma * activation;
      col   = max(col, layerCol * a);
      alpha = max(alpha, a);
    }

    if (u_holo_mode == 3) {
      float subjectAlpha = texture2D(u_subject_mask, uv).a;
      col   *= subjectAlpha;
      alpha *= subjectAlpha;
    }

    gl_FragColor = vec4(col, alpha);
  }
```

Note: `uv` is the same full-card UV already used for `gl_FragCoord` mapping and `in_art` bounds — `subject_layer_url` PNGs are full-card-sized and pixel-aligned with `image_url`, so no remapping through `u_artwork_bounds` is needed. Multiplying (rather than a hard `discard`) preserves remove.bg's antialiased silhouette edges as a natural soft clip. Mode 3 does not match the `u_holo_mode == 1` / `== 2` early-`return` checks above it, so it falls through to the full shimmer loop unclipped by `in_art`, then gets masked here.

- [ ] **Step 3: Commit**

```bash
git add src/components/HoloCard/shaders.ts
git commit -m "feat(holo): clip shimmer to subject silhouette in subject_holo mode"
```

---

### Task 4: Derive `subject_holo` mode and wire the mask URL through `HoloCard`

**Files:**
- Modify: `src/components/HoloCard/HoloCard.tsx`
- Test: `src/components/HoloCard/__tests__/HoloCard.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/components/HoloCard/__tests__/HoloCard.test.tsx`, change the import:

```tsx
import HoloCard from '../HoloCard'
```

to:

```tsx
import HoloCard, { deriveHoloMode } from '../HoloCard'
```

Then add this `describe` block after the existing `describe('HoloCard', ...)` block (same file, top level):

```tsx
describe('deriveHoloMode', () => {
  it('returns subject_holo for standard holo cards with a subject layer extracted', () => {
    expect(deriveHoloMode({ ...holoCard, subject_layer_url: 'https://example.com/subject.png' })).toBe('subject_holo')
  })

  it('returns full_holo for standard holo cards without a subject layer', () => {
    expect(deriveHoloMode(holoCard)).toBe('full_holo')
  })

  it('returns reverse_holo regardless of subject layer presence', () => {
    expect(deriveHoloMode({ ...holoCard, holo_type: 'reverse', subject_layer_url: 'https://example.com/subject.png' })).toBe('reverse_holo')
  })

  it('returns none regardless of subject layer presence', () => {
    expect(deriveHoloMode({ ...holoCard, holo_type: 'none', subject_layer_url: 'https://example.com/subject.png' })).toBe('none')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/HoloCard/__tests__/HoloCard.test.tsx`
Expected: FAIL — `deriveHoloMode` is not exported from `'../HoloCard'`

- [ ] **Step 3: Export and extend `deriveHoloMode`**

In `src/components/HoloCard/HoloCard.tsx`, change:

```tsx
function deriveHoloMode(card: Card): HoloMode {
  if (card.holo_type === 'reverse') return 'reverse_holo'
  if (card.holo_type === 'none') return 'none'
  return 'full_holo'  // standard, full_art, rainbow
}
```

to:

```tsx
export function deriveHoloMode(card: Card): HoloMode {
  if (card.holo_type === 'reverse') return 'reverse_holo'
  if (card.holo_type === 'none') return 'none'
  if (card.subject_layer_url) return 'subject_holo'
  return 'full_holo'  // standard, full_art, rainbow
}
```

- [ ] **Step 4: Pass `subjectMaskUrl` to `useHoloShader`**

In `src/components/HoloCard/HoloCard.tsx`, change:

```tsx
  useHoloShader(canvasRef, {
    enabled: size === 'lg',
    seedOffset: seed,
    artworkBounds,
    holoMode,
    pointer: pointerRef.current,
  })
```

to:

```tsx
  useHoloShader(canvasRef, {
    enabled: size === 'lg',
    seedOffset: seed,
    artworkBounds,
    holoMode,
    pointer: pointerRef.current,
    subjectMaskUrl: card.subject_layer_url ?? null,
  })
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/HoloCard/__tests__/HoloCard.test.tsx`
Expected: PASS — all tests green (existing + 4 new `deriveHoloMode` cases)

- [ ] **Step 6: Commit**

```bash
git add src/components/HoloCard/HoloCard.tsx src/components/HoloCard/__tests__/HoloCard.test.tsx
git commit -m "feat(holo): derive subject_holo mode from subject_layer_url"
```

---

### Task 5: Manual smoke test in the browser

**Files:** none (verification only)

- [ ] **Step 1: Find neo1 cards that have layers extracted**

Run: `npm run dev`, then open `http://localhost:5173/polygon-test` — this route lists cards with `subject_layer_url`/`bg_layer_url` populated (filters `.not('subject_layer_url', 'is', null)`). Note 2-3 card names/numbers from the neo1 set shown there.

- [ ] **Step 2: View those cards at `size="lg"` and confirm the new shimmer**

Open a pack containing one of those cards (Shop → buy a neo1 pack → open it in PackRip), or navigate to wherever `size="lg"` `HoloCard` is rendered for that card (check `src/components/PackRip/` and `src/routes/Collection.tsx` for `size="lg"` usage). Move the pointer across the card and confirm:
- The shimmer traces the Pokémon's silhouette specifically (not the full rectangular artwork area)
- Edges look clean/antialiased, not jagged
- The card frame and background do not shimmer

- [ ] **Step 3: Confirm no regression on cards without layers**

Open a pack/card from a set with no extracted layers (e.g. base1, ex13) and confirm holo still renders exactly as before — full rectangular artwork-area shimmer for `full_holo`, frame-only shimmer for `reverse_holo`.

- [ ] **Step 4: Check the browser console for shader errors**

Confirm no `[HoloShader] compile error` or `[HoloShader] link error` messages logged (per `src/components/HoloCard/useHoloShader.ts:38,99`).

- [ ] **Step 5: Stop the dev server**

No commit for this task — it's verification only. If any issue is found, fix it in the relevant task's files and re-run the smoke test.

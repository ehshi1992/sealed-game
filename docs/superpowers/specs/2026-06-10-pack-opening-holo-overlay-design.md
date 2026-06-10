# Holo Batch Overlay — Design (Pack Opening; reusable for Collection)

**Date:** 2026-06-10
**Status:** Approved (pending spec review)

## Goal

Render the WebGL holo shimmer on cards during pack opening (dealing + summary),
which today only runs at `size === 'lg'` and is therefore absent from the
pack-opening flow (cards are `size="md"`).

## Hard Constraint — WebGL Context Budget

- Each `useHoloShader` mount = one WebGL context.
- Context cleanup **cannot** call `loseContext()` — the user's NVIDIA driver exits
  the GPU process → white-page crash (see memory `feedback_webgl_lose_context`).
  So contexts only release on GC, not on unmount.
- Naively enabling holo per card leaks one context per mount. The pack-opening
  top deck card is keyed (`deck-${deckIndex}`) and **remounts every reveal**, so a
  10-card pack would leak up to 10 contexts per open, accumulating across opens
  until the ~16 context limit triggers context-loss crash.

**Therefore: the entire pack-opening holo must run on ONE long-lived context,
regardless of how many cards are shimmering.**

## Chosen Approach — Single Canvas + Scissor/Viewport Batch (A+)

One full-container `<canvas>` with a single WebGL context, owned for the whole
PackRip lifetime. Each animation frame, iterate the set of visible holo cards and
draw each into its own screen rectangle using `gl.viewport` + `gl.scissor`:

```
gl.enable(gl.SCISSOR_TEST)              // once
for (entry of activeEntries) {
  const {x, y, w, h} = entry.glRect     // canvas pixel coords, GL origin
  gl.viewport(x, y, w, h)
  gl.scissor(x, y, w, h)
  // per-card uniforms:
  gl.uniform2f(u_viewport_origin, x, y)
  gl.uniform2f(u_resolution, w, h)
  gl.uniform2f(u_seed_offset, entry.seed.x, entry.seed.y)
  gl.uniform2f(u_pointer, entry.pointer.x, entry.pointer.y)
  gl.uniform1i(u_holo_mode, HOLO_MODE_INT[entry.holoMode])
  gl.uniform4f(u_artwork_bounds, ...entry.artworkBounds)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}
```

One context renders the whole summary grid simultaneously. Scales to any card
count at a fixed budget of **1 context** (plus PackTearScene's own context, which
only exists during the `pack` phase).

### Why not the alternatives
- **Keyed per-card holo (B):** simplest, but leaks per reveal/focus → crash. Rejected.
- **Single canvas, 1 active card (A):** safe but needlessly limits holo to one card.
  A+ is the same context cost with no functional compromise.
- **Offscreen render → bitmap copy:** 1 context but adds per-card 2D canvas + copy
  cost and more code. Unnecessary.

## Shader Change

`gl_FragCoord` is canvas-global, so under a per-card viewport the existing
`uv = gl_FragCoord.xy / u_resolution` is wrong (offset by the card's origin).

Add one uniform and offset the UV:

```glsl
uniform vec2 u_viewport_origin;   // canvas-pixel origin of this card's viewport
...
vec2 uv = (gl_FragCoord.xy - u_viewport_origin) / u_resolution;
uv.y = 1.0 - uv.y;
```

Backward compatible: single-card `useHoloShader` sets `u_viewport_origin = (0,0)`
and `u_resolution = canvas size` → byte-identical output to today.

## Components & Files

### 1. `holoGL.ts` (new) — shared GL setup
Extract from `useHoloShader.ts`: `compileShader`, `uploadBitmapTexture`, `initGL`,
the `Uniforms` type, `HOLO_MODE_INT`, `DEFAULT_HOLO_PARAMS`, and the cosmo-bitmap
preload. Add `u_viewport_origin` to `Uniforms` and its `getUniformLocation`. Single
source of GL init for both consumers. Keeps the existing `activeContextCount` cap.

### 2. `useHoloShader.ts` — refactor to use `holoGL.ts`
Behavior unchanged. Set `u_viewport_origin = (0,0)`, `u_resolution = canvas size`
in its render loop. Single-card path stays as-is.

### 3. `HoloBatchCanvas.tsx` (new) — reusable batch overlay
General, **not** pack-specific (so collection/binder can reuse it — see Follow-up).
- Renders one `<canvas className="holo-batch-canvas">`, absolutely positioned to
  cover its container (`inset: 0`, `pointer-events: none`, `z-index` above card
  images, below UI chrome). `position: fixed` variant via prop for scrolling
  surfaces (collection) so the canvas tracks the viewport.
- Props: `entries: HoloEntry[]`, `pointer: {x,y}` (shared pointer), optional
  `fixed?: boolean`.
- `HoloEntry = { id: string; el: HTMLElement | null; card: Card; seed: HoloSeed }`.
  `holoMode`/`artworkBounds` derived from `card` (reuse `deriveHoloMode`; skip
  entries with `holoMode === 'none'` or no `artwork_bounds`).
- Owns one context via `holoGL.initGL`, one RAF loop. Reads `entries` from a ref so
  data changes never tear down / re-init the context.
- Each frame: resize canvas to container × DPR (once if changed); clear; for each
  entry compute `glRect` from `el.getBoundingClientRect()` relative to the canvas
  rect; **cull entries fully outside the canvas viewport** (cost ∝ visible cards,
  not total — required for large collection grids); draw the survivors via
  scissor/viewport batch.
- Cleanup: `cancelAnimationFrame` + decrement counter only (no `loseContext`).

### 3b. `useHoloEntry(ref, card, seed)` (new) — registration hook
Optional ergonomic hook for consumers: registers `{id, el, card, seed}` into a
caller-provided entries store (or returns a stable entry object the parent
collects). Lets any grid opt a card into the nearest `HoloBatchCanvas` without the
parent manually threading every ref. Pack opening can collect refs directly; the
hook mainly pays off for collection/binder. Build it now, use where convenient.

### 4. `coords.ts` helper (new, pure) — DOM rect → GL viewport
```
domRectToGLRect(cardRect, canvasRect, canvasPxHeight, dpr)
  -> { x, y, w, h }   // GL pixel coords, bottom-left origin
```
DOM is top-left/y-down; GL viewport is bottom-left/y-up:
`glY = canvasPxHeight - (relTop + relHeight) * dpr`. Pure → unit-testable.

### 5. `PackRip.tsx` — wire it up
- Keep a registry of active card DOM elements:
  - **Dealing:** one entry for the top deck card (`topCardRef`). Peek cards stay
    static (no holo) to keep the focus on the active card.
  - **Summary:** one entry per grid slot (refs collected into an array/map).
- Track a shared pointer (reuse existing pointer math; one global pointer drives
  all cards' tilt — natural for a "tilt the whole spread" feel).
- Render `<HoloBatchCanvas entries={entries} pointer={pointer} />` only during
  `dealing` and `summary`. Not during `pack` (PackTearScene owns GL then).
- The flying card: drop it from `entries` during its 320ms fly (or leave it — its
  rect moves and scissor clips correctly; default = keep, revisit if it looks off).
- `HoloCard` in pack-opening stays `size="md"` with its own shader disabled; the
  overlay supplies the shimmer. The card `<img>` shows through under the canvas.

### 6. CSS
`.pack-holo-canvas { position:absolute; inset:0; pointer-events:none; z-index:<above card img, below progress/hint/actions>; }`.
Confirm stacking against existing `.pack-rip__deck` layers.

## Data Flow
```
pointer move (PackRip) ──► pointer state ──► PackHoloCanvas (ref)
card refs (PackRip) ──► entries[] ──► PackHoloCanvas (ref) ──► RAF:
   per entry: getBoundingClientRect ──► domRectToGLRect ──► viewport/scissor ──► draw
```

## Error / Edge Handling
- Context cap reached or `getContext` fails → canvas hidden (`display:none`),
  cards show without holo (graceful, same as current single-card fallback).
- `webglBroken` flag from shared module respected — no retry storm.
- Entry `el` null (ref not yet attached) or rect zero-size → skip that entry.
- DPR change / resize → recompute canvas backing size each frame guard.
- No `loseContext` anywhere.

## Testing
- `domRectToGLRect` pure unit tests: y-flip, dpr scaling, container offset,
  off-canvas → still returns rect (caller skips), zero-size guard.
- `deriveHoloMode` already covered.
- Manual/preview: dealing top card shimmers; summary grid shimmers; tilt tracks
  pointer; open multiple packs back-to-back → context count stays ~1 (verify via
  `activeContextCount` log / no context-loss warning).

## Follow-up — Collection View (designed, not built in this effort)
Scope chosen: **pack first, reusable shape.** `HoloBatchCanvas` is built general so
collection wires in later with minimal work:
- Collection grid (`Collection.tsx` line ~189, `size="sm"` cards) collects its slot
  refs into `entries`; render one `<HoloBatchCanvas fixed entries={...} pointer />`
  over the scroll container.
- `fixed` canvas + per-frame `getBoundingClientRect` + viewport culling handles
  scrolling and large card counts at **one context** for the grid.
- The `lg` modal card keeps its own `useHoloShader` context (separate stacking
  context above the grid; can't share one canvas across the modal layer).
- Binder grid + drag overlay can reuse the same component identically.
- Context budget when collection wired: grid overlay (1) + modal (1, only when
  open) = ≤2 on that route. No per-card growth.

## Out of Scope
- Wiring collection/binder this effort (component is built reusable; see Follow-up).
- Folding the `lg` modal card into the shared canvas (separate stacking context).
- Changing the holo look/params (reuse `DEFAULT_HOLO_PARAMS`).
- Holo on peek/deck-back cards.
- Per-card independent pointers in summary (single shared pointer).

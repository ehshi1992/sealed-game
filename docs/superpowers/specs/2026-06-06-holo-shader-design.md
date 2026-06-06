# Holo Shader & Card Seed Design

**Date:** 2026-06-06  
**Status:** Approved

## Overview

Each card instance owned by a user has a unique `holo_seed` — an (x, y) float pair in [0,1] that deterministically shifts the cosmo foil pattern on the card. This mirrors CS:GO float values: the seed is tied to the collectible entity, affects visual output, and by extension perceived value (e.g. swirl centered on the Pokémon face = more desirable).

A WebGL fragment shader renders the cosmo foil pattern, masked to either the artwork region (full holo) or everything outside it (reverse holo), driven by the seed offset and mouse/tilt pointer position.

---

## 1. Database Schema

### `cards` table — new columns

```sql
-- Layout & CV
card_layout_type  TEXT   -- 'standard' | 'ex_gx' | 'v_vmax' | 'full_art' | 'trainer' | 'energy'
artwork_bounds    JSONB  -- {x, y, w, h} as 0–1 fractions of card dims; computed by CV script

-- Extended TCG metadata (sourced from pokemontcg.io API v2)
supertype                  TEXT    -- 'Pokémon' | 'Trainer' | 'Energy'
subtypes                   TEXT[]  -- ['Basic'], ['V', 'VMAX'], ['Stage 2'], etc.
hp                         INT     -- nullable (Trainers/Energy have no HP)
types                      TEXT[]  -- ['Fire'], ['Water', 'Lightning'], etc.
artist                     TEXT
flavor_text                TEXT
national_pokedex_numbers   INT[]
set_name                   TEXT    -- 'Scarlet & Violet', 'Base Set', etc.
set_code                   TEXT    -- 'sv1', 'base1', etc.
rarity_raw                 TEXT    -- original API string: 'Rare Holo', 'Secret Rare', etc.
```

`holo_type` (existing) is unchanged — it determines holo mode (full/reverse/none).  
`card_layout_type` is the CV hint for artwork bounds detection.

**Future extension:** `subject_mask JSONB` — polygon `[{x,y}]` of the Pokémon subject within the artwork region, for per-subject holo masking (not in this iteration).

### `user_collection` table — new column

```sql
holo_seed  JSONB  -- {x: float, y: float} in [0,1]; generated once at pack open, immutable
```

---

## 2. CV Pre-processing Script

**File:** `scripts/process-holo-masks.ts`

Runs once over all existing cards, then on any new batch seeded via `seed-cards.ts`.

### Pipeline

1. Fetch all `cards` rows where `artwork_bounds IS NULL` from Supabase
2. For each card: download `image_url` to buffer via `fetch`
3. Select layout template based on `card_layout_type`:

| `card_layout_type` | Default `artwork_bounds` |
|--------------------|--------------------------|
| `standard`         | `{x:0.07, y:0.11, w:0.86, h:0.36}` |
| `ex_gx`            | `{x:0.07, y:0.09, w:0.86, h:0.40}` |
| `v_vmax`           | `{x:0.00, y:0.00, w:1.00, h:0.65}` |
| `full_art`         | `{x:0.00, y:0.00, w:1.00, h:1.00}` |
| `trainer`          | `{x:0.20, y:0.12, w:0.60, h:0.28}` |
| `energy`           | `{x:0.20, y:0.12, w:0.60, h:0.28}` |

4. Optionally refine bounds via `sharp` edge detection on the image buffer to snap to actual artwork border
5. PATCH `cards.artwork_bounds` in Supabase

**Future:** Step 4 extended to produce `subject_mask` polygon via segmentation model.

---

## 3. open-pack Edge Function

Add seed generation at card distribution time:

```ts
// Inside the card insertion loop in supabase/functions/open-pack/index.ts
const holo_seed = { x: Math.random(), y: Math.random() }
// Insert into user_collection alongside existing fields
```

Seed is generated server-side, stored once, never regenerated.

---

## 4. WebGL Shader Architecture

### New files

```
src/components/HoloCard/
  shaders.ts          # GLSL vertex + fragment shader source strings
  useHoloShader.ts    # Hook: WebGL context lifecycle, uniform updates, rAF loop
```

### Canvas placement

Single `<canvas>` added inside `.card`, `position: absolute; inset: 0`. `mix-blend-mode: color-dodge`. Existing CSS holo/sparkle/glare layers are retained for parallax and glare; the WebGL canvas adds the cosmo foil pattern on top.

### Fragment shader uniforms

```glsl
uniform vec2  u_resolution;      // canvas pixel dimensions
uniform vec2  u_seed_offset;     // from user_collection.holo_seed [0,1]
uniform vec2  u_pointer;         // normalized mouse/touch position [0,1]
uniform float u_time;            // seconds, drives animation
uniform int   u_holo_mode;       // 0=none, 1=full_holo, 2=reverse_holo
uniform vec4  u_artwork_bounds;  // xywh as [0,1] fractions of card dims
```

### Cosmo foil algorithm

1. Compute UV from `gl_FragCoord / u_resolution`
2. Determine `in_art`: UV inside `u_artwork_bounds`
3. Discard (output `vec4(0)`) based on mode:
   - `full_holo`: discard if `!in_art`
   - `reverse_holo`: discard if `in_art`
   - `none`: discard all (canvas invisible)
4. Shift UV by `u_seed_offset` — sole visual effect of the seed (pattern placement)
5. Domain-warp UV with FBM noise → organic cosmo swirl
6. Compute hue: `hue = atan(warped.y, warped.x) + u_time * 0.2 + u_pointer.x * 2.0`
7. Output HSL→RGB, saturation=1, lightness=0.5, alpha=0.6

### `useHoloShader` hook

```ts
useHoloShader(
  canvasRef: RefObject<HTMLCanvasElement>,
  opts: {
    seedOffset: { x: number; y: number }
    artworkBounds: { x: number; y: number; w: number; h: number } | null
    holoMode: 'none' | 'full_holo' | 'reverse_holo'
    pointer: { x: number; y: number }
  }
)
```

Responsibilities:
- Init WebGL context on mount; cleanup (lose context) on unmount
- Compile vertex + fragment shaders; link program
- Draw fullscreen quad (2 triangles covering NDC)
- Start `requestAnimationFrame` loop updating `u_time`
- Update `u_pointer` and `u_seed_offset` on prop change (no recompile)
- Fallback: if WebGL unavailable, canvas stays hidden; CSS holo layers still render

### HoloCard.tsx changes

- New prop: `holoSeed?: { x: number; y: number }` (defaults to `{x:0.5, y:0.5}` if absent)
- Derive `holoMode` from `card.holo_type`:
  - `'standard'` → `full_holo`
  - `'reverse'` → `reverse_holo`
  - `'full_art'` | `'rainbow'` → `full_holo` (artwork_bounds = full card)
  - `'none'` → `none`
- Pointer state from existing `handleMouseMove` also fed to `useHoloShader` opts
- `card.artwork_bounds` passed through; if null (not yet computed), shader mode = `none`

---

## 5. Data Flow Summary

```
Pack open (Edge Function)
  → generate holo_seed {x,y}
  → insert user_collection row with holo_seed

Card render (HoloCard.tsx)
  → card.artwork_bounds (from cards table, precomputed by CV script)
  → user_collection.holo_seed
  → useHoloShader: init WebGL, set uniforms, rAF loop
  → <canvas> composited over card image via color-dodge
  → mouse/touch → update u_pointer uniform
```

---

## 6. Out of Scope (This Iteration)

- Subject segmentation (`subject_mask`) — future enhancement
- Seed trading, inspecting, or displaying seed values to users
- Grading tiers / float-like quality buckets (no condition system, seed is purely visual)
- Secondary market / value ranking by seed quality

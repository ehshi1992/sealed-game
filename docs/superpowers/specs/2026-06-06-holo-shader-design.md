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

### Files

```
src/components/HoloCard/
  shaders.ts          # GLSL vertex + fragment shader source strings
  useHoloShader.ts    # Hook: WebGL context lifecycle, uniform updates, rAF loop
public/textures/
  cosmo-bitmap.png    # 512×715 greyscale bitmap extracted from real foil photos
scripts/
  extract-holo-bitmap.ts   # Generates cosmo-bitmap.png from docs/holo-reference/
  generate-cosmo-bitmaps.ts  # Generates scrambled variants for experimentation
```

### Canvas placement

Single `<canvas>` inside `.card`, `position: absolute; inset: -12px` (bleeds 12px beyond card edge). `mix-blend-mode: screen`. `.card` has `overflow: visible`; other layers (img, holo, sparkle, glare) use `clip-path: inset(0 round 4.75% / 3.5%)` to maintain rounded corners.

### Fragment shader uniforms

```glsl
uniform vec2      u_resolution;      // canvas pixel dimensions
uniform vec2      u_seed_offset;     // from user_collection.holo_seed [0,1]
uniform vec2      u_pointer;         // normalized mouse/touch position [0,1]
uniform int       u_holo_mode;       // 0=none, 1=full_holo, 2=reverse_holo
uniform vec4      u_artwork_bounds;  // xywh as [0,1] fractions of card dims
uniform sampler2D u_cosmo_bitmap;    // greyscale foil pattern texture
```

### Cosmo foil algorithm

1. Compute UV from `gl_FragCoord / u_resolution`, flip Y
2. Clip based on `u_holo_mode` + `u_artwork_bounds` (same as before)
3. Sample bitmap twice at slightly different UV scales (layers 0 and 1)
4. Each layer has a per-pixel preferred tilt angle encoded from UV + seed
5. Activation = `mix(0.25, cos(tiltAngle - pixelAngle) * 0.5 + 0.5, tilt * 2.5)` — wide cosine wave, nothing fully hides
6. Layers are offset 180° in tilt space so they shimmer alternately as you tilt
7. Hue per layer driven by `baseHue + UV spread + per-layer offset`
8. Final color/alpha = `max()` across both layers (brightest wins)

**Key constraint:** bitmap is NPOT (512×715) — `CLAMP_TO_EDGE`, no mipmaps.

### `useHoloShader` hook

```ts
useHoloShader(
  canvasRef: RefObject<HTMLCanvasElement>,
  opts: {
    enabled: boolean
    seedOffset: { x: number; y: number }
    artworkBounds: { x: number; y: number; w: number; h: number } | null
    holoMode: 'none' | 'full_holo' | 'reverse_holo'
    pointer: { x: number; y: number }
  }
)
```

- Only enabled for `size === 'lg'` cards
- Module-level `cosmoImg` preload shared across all instances
- Context cap: 16 active WebGL contexts max; excess cards skip canvas
- Fallback: WebGL unavailable → canvas hidden, CSS layers still render

### HoloCard.tsx

- `holoSeed` prop defaults to `{x:0.5, y:0.5}`
- `holoMode` derived from `card.holo_type` (standard/full_art/rainbow → full_holo, reverse → reverse_holo, none → none)
- Canvas only rendered for `size === 'lg'`; `enabled: size === 'lg'` passed to hook

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

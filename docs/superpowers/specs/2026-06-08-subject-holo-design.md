# Subject-Traced Holo for Layer-Extracted Cards — Design

**Date:** 2026-06-08

## Problem

The cosmo foil shader (`src/components/HoloCard/`) currently clips `full_holo` / `reverse_holo` to a rectangular `artwork_bounds` box — a coarse approximation of the illustration region. The card-layer-extraction pipeline (`scripts/process-card-layers.ts`) has produced pixel-accurate `subject_layer_url` (Pokémon silhouette, transparent elsewhere) and `bg_layer_url` (background, transparent where the Pokémon is) PNGs for 81/111 neo1 cards, stored in Supabase Storage bucket `card-layers`.

This design adds a new holo treatment that uses `subject_layer_url` to make the shimmer trace the Pokémon's silhouette specifically — a more dramatic, "cosmos"-style effect than the current uniform full-art shimmer.

## Scope

- Applies only to cards that (a) currently qualify for `full_holo` (i.e. `holo_type` is `standard`/`full_art`/`rainbow`) **and** (b) have `subject_layer_url` populated.
- `reverse_holo` is untouched — keeps its existing rect-based clip.
- Cards without `subject_layer_url` (the other ~30 neo1 cards + all cards in ex13/base1/ecard1/xy4) keep the current rect-clip `full_holo` behavior. **No regression** — this is purely additive for processed cards.

## Changes

### 1. Types (`src/types.ts`)
- Add to `Card`: `subject_layer_url?: string | null`, `bg_layer_url?: string | null`
- Extend `HoloMode`: `'none' | 'full_holo' | 'reverse_holo' | 'subject_holo'`

### 2. Mode derivation (`HoloCard.tsx`)
`deriveHoloMode(card)` gains a branch: if the card would otherwise resolve to `full_holo` and `card.subject_layer_url` is set, return `'subject_holo'` instead. `reverse_holo`/`none` paths unchanged.

### 3. Texture loading (`useHoloShader.ts`)
- New hook option: `subjectMaskUrl: string | null`
- Module-level cache `Map<string, HTMLImageElement>` keyed by URL — mirrors the existing `cosmoImg` shared-preload pattern, but per-mask-URL so repeat instances of the same card reuse the decoded image
- Each canvas's GL context (`initGL`) uploads the cached `<img>` into its own texture on unit 2, with a 1×1 transparent placeholder uploaded first and a `load` listener to re-upload once decoded (same approach as `uploadBitmapTexture` for the cosmo bitmap)
- `useEffect` dependency array gains `subjectMaskUrl` so the shader re-initializes when the active card (and therefore mask) changes on a reused canvas

### 4. Shader (`shaders.ts`)
- New uniform: `uniform sampler2D u_subject_mask;`
- New `HOLO_MODE_INT` entry: `subject_holo: 3`
- In `main()`, mode `3` branch: sample `texture2D(u_subject_mask, uv).a` using the same full-card `uv` already computed (subject PNGs are full-card-sized and pixel-aligned with `image_url` — no `artwork_bounds` remapping needed) and **multiply** that alpha into the existing two-layer cosmo shimmer's output alpha/color. Multiplying rather than hard-discarding preserves remove.bg's antialiased silhouette edges as a natural soft clip.

### 5. Fallback behavior
No change to the `full_holo`/`reverse_holo`/`none` code paths. `subject_holo` is purely additive — selected only when both qualifying conditions hold.

## Testing

- Extend `HoloCard.test.tsx` / `useHoloShader.test.ts`: a card with `holo_type: 'standard'` and `subject_layer_url` set → `deriveHoloMode` resolves to `'subject_holo'`; one without `subject_layer_url` still resolves to `'full_holo'`
- Manual smoke test: open PackRip / Collection on neo1 cards known to have layers (cross-reference via `/polygon-test`), confirm shimmer traces the silhouette with clean (non-jagged) edges, and confirm unprocessed cards render exactly as before

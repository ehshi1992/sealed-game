# Cosmo Foil Bitmap-Driven Holo Implementation Plan

> **Status: COMPLETED 2026-06-07**

**Goal:** Replace procedural GLSL cosmo foil generation with CV-extracted bitmaps from real reference photos.

**What shipped:** Single greyscale channel bitmap (512×715 portrait), two-layer tilt-angle activation shader, canvas bleed beyond card edges. See `docs/superpowers/specs/2026-06-06-holo-shader-design.md` Section 4 for final architecture.

---

## Divergence from Original Plan

| Original plan | What actually shipped |
|---|---|
| 512×512 square texture | 512×715 portrait (matches card ratio) |
| R/G/B multi-channel (large orbs / fine dots / medium orbs) | Single greyscale channel — R channel only, others unused |
| `REPEAT` wrap + `fract(uv + seed)` tiling | `CLAMP_TO_EDGE` (NPOT constraint) + `fract(uv * scale - offset)` per layer |
| `u_time` uniform, animated pattern | No `u_time` — pattern is static, tilt-driven only |
| 3 reference photos → averaged composite | 6 reference photos; used `image-full-scanned.jpg` derivatives |
| Shader colorizes R/G/B channels separately | Single HSL colorize with per-pixel tilt angle activation |
| Canvas at `inset: 0` | Canvas bleeds 12px: `inset: -12px` |
| `mix-blend-mode: color-dodge` | `mix-blend-mode: screen` |

---

## Tasks — Final Status

- [x] **Task 1:** Add `sharp`, scaffold dirs — done
- [x] **Task 2:** CV extraction script — done (rewritten to use homography for angled photo + direct thresh, no multi-scale blur)
- [x] **Task 3:** Generate bitmap — done (`public/textures/cosmo-bitmap.png` = 512×715 greyscale)
- [x] **Task 4:** Rewrite FRAG_SRC — done (two-layer tilt-angle activation, no u_time, CLAMP_TO_EDGE)
- [x] **Task 5:** Update useHoloShader — done (NPOT texture fix, module-level preload, no startTime/u_time)
- [x] **Task 6:** Fix call sites, smoke test — done
- [x] **Task 7:** Threshold tuning — done (switched approach entirely to direct greyscale thresh)
- [x] **Bonus:** Canvas bleed + clip-path architecture — done
- [x] **Bonus:** Two-layer shimmer — done
- [x] **Bonus:** `generate-cosmo-bitmaps.ts` utility — created (kept, scrambles real bitmaps for experimentation)
- [x] **Bonus:** HoloTest energy card (Base Set Fire Energy #98) — added
- [x] **Bonus:** CLAUDE.md updated with final architecture

---

## Key Files

| File | Purpose |
|---|---|
| `src/components/HoloCard/shaders.ts` | GLSL — two-layer bitmap activation shader |
| `src/components/HoloCard/useHoloShader.ts` | Hook — WebGL lifecycle, NPOT texture, context cap |
| `src/components/HoloCard/HoloCard.css` | `overflow:visible`, canvas bleed, `clip-path` on content layers |
| `public/textures/cosmo-bitmap.png` | 512×715 greyscale foil bitmap |
| `public/textures/cosmo-bitmaps/` | Source thresh images (image1/2/3, angled/bordered/scanned) |
| `scripts/extract-holo-bitmap.ts` | Regenerate bitmap from `docs/holo-reference/` photos |
| `scripts/generate-cosmo-bitmaps.ts` | Generate scrambled variants (utility, not in primary flow) |

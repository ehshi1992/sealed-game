# Subject Polygon Extraction — Design Spec

**Date:** 2026-06-07  
**Status:** approved  
**Goal:** One-off Python script that segments the Pokémon subject from card art, produces a normalized polygon, and a `/polygon-test` React route for visual validation.

---

## Scope

- Pokémon cards only — trainer and energy cards are skipped via DB `card_layout_type`
- Initial target: Neo Genesis set, including Lugia + 5 representative cards
- Output polygons will eventually be persisted to `cards.subject_polygon` and used by the holo shader to constrain pattern randomization to the subject area

---

## Script: `scripts/extract-subject-polygons.py`

### Inputs

| Arg | Default | Description |
|-----|---------|-------------|
| `card_ids` (positional, repeatable) | — | Process specific cards by ID |
| `--all` | false | Process all non-trainer, non-energy cards |
| `--local-dir PATH` | — | Load images from local directory instead of `image_url` in DB |
| `--epsilon FLOAT` | `0.02` | `approxPolyDP` epsilon as fraction of arc length. Lower = tighter polygon |
| `--debug` | false | Emit composite debug sheet |
| `--output-dir PATH` | `output/` | Root dir for polygons + debug output |

### Dependencies

```
rembg
opencv-python
Pillow
requests
supabase-py
python-dotenv
```

### Pipeline (per card)

1. **Fetch card metadata** from Supabase — `card_layout_type`, `artwork_bounds`, `image_url`
2. **Skip** if `card_layout_type in ('trainer', 'energy')`
3. **Load image** — from `--local-dir` if provided, else download `image_url`
4. **Crop to art area** using `artwork_bounds` (normalized → pixel coords). Focusing rembg on the portrait zone reduces noise from card frame, name bar, and HP text.
5. **rembg segmentation** — `rembg.remove(img_crop)` returns RGBA; extract alpha channel as mask
6. **Contour extraction** — `cv2.findContours` on alpha (threshold at 128), pick largest contour by area
7. **Polygon simplification** — `cv2.approxPolyDP(contour, epsilon * arcLength, closed=True)`
8. **Re-normalize** — polygon points back to full-card space (0–1), not crop space
9. **Quality metrics** (printed to console):
   - `vertex_count` — flag if <5 or >60
   - `coverage_ratio` — polygon area / art-area rect area; flag if <0.10 or >0.85
   - `mean_alpha` — average alpha value of foreground pixels; flag if <180 (uncertain segmentation)
   - `contour_count` — flag if >3 significant contours (fragmented subject)
10. **Write output** — `{output_dir}/polygons/{card_id}.json`

### JSON output format

```json
{
  "card_id": "abc123",
  "polygon": [[0.31, 0.18], [0.45, 0.14], [0.68, 0.22], ...],
  "metrics": {
    "vertex_count": 18,
    "coverage_ratio": 0.41,
    "mean_alpha": 224,
    "contour_count": 1
  }
}
```

Polygon points are `[x, y]` normalized to full card dimensions (0–1).

---

## Debug Output

When `--debug` is passed, the script writes a **composite sheet** to `{output_dir}/debug-sheet.png`.

Each card occupies one row with 3 panels (each panel = art-crop size):

| Panel | Content |
|-------|---------|
| Original | Raw art crop |
| Alpha mask | rembg alpha channel rendered as greyscale |
| Polygon overlay | Art crop with polygon drawn (green stroke + 30% fill), metrics text overlaid |

Row height scales to the tallest art crop. Grid is padded 8px between cells.

---

## React Route: `/polygon-test`

Mirrors the `HoloTest.tsx` pattern.

### Data source

Reads polygon JSONs from `output/polygons/` at dev time. A small Vite `?raw` import or a local fetch against `/polygon-test-data/` (served from `public/polygon-test-data/` during dev) provides the data without a DB call.

### Per-card display

Each card renders:
- Card image (`<img>` at 300×418px)
- `<svg>` absolutely positioned over the card — `<polygon>` element with normalized points scaled to display size, semi-transparent teal fill + 2px stroke
- Mouse move over card updates a `pointer` ref, which drives a live holo-offset preview: the polygon fill shifts color/opacity to simulate how the holo pattern offset will track within subject bounds

### Controls

| Control | Effect |
|---------|--------|
| Toggle polygon | Show/hide SVG overlay |
| Toggle holo preview | Enable/disable pointer-driven fill animation |
| Epsilon slider (0.005–0.05) | Re-fetches polygon at selected epsilon (requires `--debug` pre-run at multiple epsilons, or re-runs script on demand) |

### Route registration

```tsx
// src/App.tsx
{ path: '/polygon-test', element: <PolygonTest /> }
```

Linked from dev nav alongside `/holo-test`.

---

## Trainer / Energy Skip Logic

```python
SKIP_LAYOUT_TYPES = {'trainer', 'energy'}

if card['card_layout_type'] in SKIP_LAYOUT_TYPES:
    print(f"  skip {card['id']} ({card['card_layout_type']})")
    continue
```

---

## Test Card Set

| Card | Expected challenge |
|------|--------------------|
| Lugia (Neo Genesis) | Large subject, light blue gradient bg |
| Typhlosion (Neo Genesis) | Dark subject, flame effects at edges |
| Pichu (Neo Genesis) | Small subject, lots of empty art area |
| Slowking (Neo Genesis) | Subject with accessory (crown) — tests if polygon captures decoration |
| Ampharos (Neo Genesis) | Mid-size, busy background — stress test for rembg |
| Meganium (Neo Genesis) | Flower petals extending from body — tests fragmented contour handling |

---

## Future Integration

Once polygons are validated:
1. Add `subject_polygon jsonb` column to `cards` table (migration)
2. Script variant to bulk-upload validated JSONs to Supabase
3. Holo shader samples `subject_polygon` to clip pattern + constrain random seed offset to subject bounding box

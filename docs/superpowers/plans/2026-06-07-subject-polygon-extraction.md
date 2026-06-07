# Subject Polygon Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Python script that segments the Pokémon subject from card art images using rembg + OpenCV, outputs normalized polygon JSONs, with a `/polygon-test` React route for visual validation.

**Architecture:** The Python script fetches card metadata from Supabase, crops to the known art area, runs rembg for subject segmentation, extracts and simplifies a contour polygon, and writes JSON files. The React route serves as a dev-only viewer that loads those JSONs from `public/polygon-test-data/` and overlays the polygon SVG on the card image with a pointer-driven holo preview.

**Tech Stack:** Python 3.11+, rembg, opencv-python, Pillow, supabase-py, python-dotenv; React 19 + TypeScript for the route.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `scripts/extract-subject-polygons.py` | Create | Main script — CLI, pipeline, output |
| `scripts/requirements-polygon.txt` | Create | Python deps for this script |
| `scripts/tests/test_polygon_utils.py` | Create | Unit tests for pure helper functions |
| `public/polygon-test-data/.gitkeep` | Create | Placeholder so dir is tracked |
| `src/routes/PolygonTest.tsx` | Create | React validation route |
| `src/App.tsx` | Modify | Register `/polygon-test` route |

---

## Task 1: Python dependencies file

**Files:**
- Create: `scripts/requirements-polygon.txt`

- [ ] **Step 1: Create requirements file**

```text
rembg==2.0.57
opencv-python==4.10.0.84
Pillow==10.4.0
requests==2.32.3
supabase==2.9.1
python-dotenv==1.0.1
```

- [ ] **Step 2: Install and verify**

```bash
pip install -r scripts/requirements-polygon.txt
python -c "import rembg, cv2, PIL, supabase; print('all deps ok')"
```

Expected output: `all deps ok`

- [ ] **Step 3: Commit**

```bash
git add scripts/requirements-polygon.txt
git commit -m "chore: python deps for subject polygon extraction"
```

---

## Task 2: Unit tests for pure helper functions

**Files:**
- Create: `scripts/tests/test_polygon_utils.py`

These functions will be implemented in Task 3. Write tests first.

- [ ] **Step 1: Create test file**

```python
# scripts/tests/test_polygon_utils.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from extract_subject_polygons import (
    renormalize_polygon,
    compute_coverage_ratio,
    compute_metrics,
)


def test_renormalize_polygon_identity():
    # artwork_bounds fills full card → polygon coords unchanged
    bounds = {'x': 0.0, 'y': 0.0, 'w': 1.0, 'h': 1.0}
    pts = [[0.25, 0.30], [0.75, 0.30], [0.75, 0.80], [0.25, 0.80]]
    result = renormalize_polygon(pts, bounds)
    assert result == pts


def test_renormalize_polygon_offset():
    # artwork_bounds at (0.1, 0.2, 0.8, 0.4)
    # crop-space point (0.5, 0.5) maps to card-space (0.1 + 0.5*0.8, 0.2 + 0.5*0.4) = (0.5, 0.4)
    bounds = {'x': 0.1, 'y': 0.2, 'w': 0.8, 'h': 0.4}
    pts = [[0.5, 0.5]]
    result = renormalize_polygon(pts, bounds)
    assert abs(result[0][0] - 0.5) < 1e-9
    assert abs(result[0][1] - 0.4) < 1e-9


def test_renormalize_polygon_corner():
    # crop-space (0, 0) maps to top-left of bounds in card space
    bounds = {'x': 0.07, 'y': 0.135, 'w': 0.86, 'h': 0.385}
    pts = [[0.0, 0.0]]
    result = renormalize_polygon(pts, bounds)
    assert abs(result[0][0] - 0.07) < 1e-9
    assert abs(result[0][1] - 0.135) < 1e-9


def test_compute_coverage_ratio_half():
    # 4-point polygon covers exactly half the art area (0.5 * 0.5 = 0.25 of 0.5 total → ratio 0.5)
    # art area w=0.5, h=0.5 → area = 0.25
    # polygon in card space: rect from (0, 0) to (0.5, 0.25) → area = 0.125 → ratio = 0.5
    bounds = {'x': 0.0, 'y': 0.0, 'w': 0.5, 'h': 0.5}
    polygon = [[0.0, 0.0], [0.5, 0.0], [0.5, 0.25], [0.0, 0.25]]
    ratio = compute_coverage_ratio(polygon, bounds)
    assert abs(ratio - 0.5) < 0.01


def test_compute_metrics_flags():
    # vertex_count < 5 → flagged
    metrics = compute_metrics(
        polygon=[[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
        bounds={'x': 0.0, 'y': 0.0, 'w': 1.0, 'h': 1.0},
        mean_alpha=230.0,
        contour_count=1,
    )
    assert metrics['vertex_count'] == 4
    assert metrics['flags']['vertex_count_low'] is True
    assert metrics['flags']['coverage_ok'] is True
    assert metrics['flags']['alpha_ok'] is True
    assert metrics['flags']['fragmented'] is False
```

- [ ] **Step 2: Run tests to confirm they fail (functions not defined yet)**

```bash
cd scripts && python -m pytest tests/test_polygon_utils.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — the script doesn't exist yet.

---

## Task 3: Core script — helpers + pipeline

**Files:**
- Create: `scripts/extract_subject_polygons.py`

Note: underscore name so it's importable by the test file.

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
extract_subject_polygons.py

Segments the Pokémon subject in card art using rembg + OpenCV.
Outputs normalized polygon JSON per card.

Usage:
  python scripts/extract_subject_polygons.py <card_id> [<card_id> ...]
  python scripts/extract_subject_polygons.py --all
  python scripts/extract_subject_polygons.py --all --debug --epsilon 0.015
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import requests
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont
from rembg import remove
from supabase import create_client

load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env.local')

SKIP_LAYOUT_TYPES = {'trainer', 'energy'}
CARD_W, CARD_H = 300, 418   # display dimensions (not processing — just for coverage calc)


# ---------------------------------------------------------------------------
# Pure helpers (tested independently)
# ---------------------------------------------------------------------------

def renormalize_polygon(
    crop_pts: list[list[float]],
    bounds: dict[str, float],
) -> list[list[float]]:
    """Map polygon points from crop-space (0-1) back to full-card space (0-1)."""
    bx, by, bw, bh = bounds['x'], bounds['y'], bounds['w'], bounds['h']
    return [[bx + p[0] * bw, by + p[1] * bh] for p in crop_pts]


def compute_coverage_ratio(
    polygon: list[list[float]],
    bounds: dict[str, float],
) -> float:
    """Ratio of polygon area to art-area rect area, both in card space (0-1)."""
    art_area = bounds['w'] * bounds['h']
    if art_area == 0:
        return 0.0
    pts = np.array(polygon, dtype=np.float32)
    poly_area = abs(cv2.contourArea(pts))
    return poly_area / art_area


def compute_metrics(
    polygon: list[list[float]],
    bounds: dict[str, float],
    mean_alpha: float,
    contour_count: int,
) -> dict[str, Any]:
    vertex_count = len(polygon)
    coverage_ratio = compute_coverage_ratio(polygon, bounds)
    return {
        'vertex_count': vertex_count,
        'coverage_ratio': round(coverage_ratio, 4),
        'mean_alpha': round(mean_alpha, 1),
        'contour_count': contour_count,
        'flags': {
            'vertex_count_low':  vertex_count < 5,
            'vertex_count_high': vertex_count > 60,
            'coverage_ok':       0.10 <= coverage_ratio <= 0.85,
            'alpha_ok':          mean_alpha >= 180,
            'fragmented':        contour_count > 3,
        },
    }


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

def load_image_pil(card: dict, local_dir: str | None) -> Image.Image:
    if local_dir:
        candidates = list(Path(local_dir).glob(f"{card['id']}.*"))
        if not candidates:
            raise FileNotFoundError(f"No local image found for {card['id']} in {local_dir}")
        return Image.open(candidates[0]).convert('RGB')
    resp = requests.get(card['image_url'], timeout=15)
    resp.raise_for_status()
    from io import BytesIO
    return Image.open(BytesIO(resp.content)).convert('RGB')


def crop_to_bounds(img: Image.Image, bounds: dict[str, float]) -> Image.Image:
    w, h = img.size
    left   = int(bounds['x'] * w)
    top    = int(bounds['y'] * h)
    right  = int((bounds['x'] + bounds['w']) * w)
    bottom = int((bounds['y'] + bounds['h']) * h)
    return img.crop((left, top, right, bottom))


def segment_subject(crop: Image.Image) -> tuple[np.ndarray, float, int]:
    """Run rembg on crop. Returns (alpha_mask uint8, mean_alpha, contour_count)."""
    result_rgba = remove(crop)   # returns PIL RGBA
    alpha = np.array(result_rgba)[:, :, 3]   # H×W uint8
    mean_alpha = float(np.mean(alpha[alpha > 128])) if np.any(alpha > 128) else 0.0

    binary = (alpha > 128).astype(np.uint8) * 255
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour_count = len(contours)
    return alpha, mean_alpha, contour_count


def extract_polygon(
    alpha: np.ndarray,
    epsilon_frac: float,
) -> list[list[float]] | None:
    """Largest contour → simplified polygon in crop-space (0-1)."""
    binary = (alpha > 128).astype(np.uint8) * 255
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    largest = max(contours, key=cv2.contourArea)
    arc_len = cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, epsilon_frac * arc_len, True)
    h, w = alpha.shape
    return [[float(pt[0][0]) / w, float(pt[0][1]) / h] for pt in approx]


# ---------------------------------------------------------------------------
# Debug sheet
# ---------------------------------------------------------------------------

PANEL_W, PANEL_H = 300, 220   # display size per panel
PANEL_PAD = 8
PANEL_COLS = 3


def make_debug_row(
    card: dict,
    crop: Image.Image,
    alpha: np.ndarray,
    polygon_card_space: list[list[float]],
    bounds: dict[str, float],
    metrics: dict,
) -> Image.Image:
    """Return a single-row 3-panel image for one card."""
    cw, ch = PANEL_W, PANEL_H
    pad = PANEL_PAD
    row_w = PANEL_COLS * cw + (PANEL_COLS + 1) * pad
    row_h = ch + 2 * pad + 20   # 20px for label at top
    row = Image.new('RGB', (row_w, row_h), (20, 20, 30))

    # Label
    draw = ImageDraw.Draw(row)
    draw.text((pad, pad), f"{card.get('name', card['id'])}  verts={metrics['vertex_count']}  cov={metrics['coverage_ratio']:.2f}  α={metrics['mean_alpha']:.0f}", fill=(180, 180, 180))

    panel_top = pad + 20

    # Panel 0: original crop
    p0 = crop.resize((cw, ch), Image.LANCZOS)
    row.paste(p0, (pad, panel_top))

    # Panel 1: alpha mask as greyscale
    alpha_resized = Image.fromarray(alpha).resize((cw, ch), Image.LANCZOS).convert('RGB')
    row.paste(alpha_resized, (pad + cw + pad, panel_top))

    # Panel 2: polygon overlay on crop
    p2 = crop.resize((cw, ch), Image.LANCZOS).convert('RGBA')
    overlay = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # Convert card-space polygon → panel-pixel coords
    # artwork_bounds maps card space → crop space, then crop space → panel pixels
    bx, by, bw, bh = bounds['x'], bounds['y'], bounds['w'], bounds['h']
    def card_to_panel(pt: list[float]) -> tuple[int, int]:
        cx = (pt[0] - bx) / bw * cw
        cy = (pt[1] - by) / bh * ch
        return (int(cx), int(cy))

    pts_px = [card_to_panel(pt) for pt in polygon_card_space]
    if len(pts_px) >= 3:
        d.polygon(pts_px, fill=(0, 255, 128, 77), outline=(0, 255, 128, 255))
        # outline with 2px width via polyline
        d.line(pts_px + [pts_px[0]], fill=(0, 255, 128, 255), width=2)

    p2 = Image.alpha_composite(p2, overlay).convert('RGB')
    row.paste(p2, (pad + 2 * (cw + pad), panel_top))

    return row


def write_debug_sheet(rows: list[Image.Image], out_path: Path) -> None:
    total_h = sum(r.height for r in rows) + PANEL_PAD
    total_w = rows[0].width if rows else 1
    sheet = Image.new('RGB', (total_w, total_h), (10, 10, 20))
    y = 0
    for row in rows:
        sheet.paste(row, (0, y))
        y += row.height
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(str(out_path))
    print(f"  debug sheet → {out_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_card(
    card: dict,
    local_dir: str | None,
    epsilon: float,
    output_dir: Path,
    debug_rows: list | None,
) -> bool:
    card_id = card['id']
    print(f"  {card_id}  ({card.get('name', '?')})")

    if card.get('card_layout_type') in SKIP_LAYOUT_TYPES:
        print(f"    skip ({card['card_layout_type']})")
        return False

    bounds = card.get('artwork_bounds') or {'x': 0.07, 'y': 0.135, 'w': 0.86, 'h': 0.385}

    try:
        img = load_image_pil(card, local_dir)
    except Exception as e:
        print(f"    ERROR loading image: {e}")
        return False

    crop = crop_to_bounds(img, bounds)
    alpha, mean_alpha, contour_count = segment_subject(crop)

    crop_poly = extract_polygon(alpha, epsilon)
    if crop_poly is None:
        print(f"    ERROR: no contour found")
        return False

    polygon = renormalize_polygon(crop_poly, bounds)
    metrics = compute_metrics(polygon, bounds, mean_alpha, contour_count)

    # Print metrics + flags
    flags = [k for k, v in metrics['flags'].items() if v and k != 'coverage_ok']
    flag_str = '  ⚠ ' + ', '.join(flags) if flags else '  ✓'
    print(f"    verts={metrics['vertex_count']}  cov={metrics['coverage_ratio']:.2f}  α={metrics['mean_alpha']:.0f}  contours={contour_count}{flag_str}")

    # Write JSON
    out_path = output_dir / 'polygons' / f"{card_id}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({'card_id': card_id, 'polygon': polygon, 'metrics': metrics}, indent=2))

    # Accumulate debug row
    if debug_rows is not None:
        row = make_debug_row(card, crop, alpha, polygon, bounds, metrics)
        debug_rows.append(row)

    return True


def main() -> None:
    parser = argparse.ArgumentParser(description='Extract subject polygons from Pokémon card art')
    parser.add_argument('card_ids', nargs='*', help='Specific card IDs to process')
    parser.add_argument('--all', action='store_true', help='Process all non-trainer/energy cards')
    parser.add_argument('--local-dir', metavar='PATH', help='Load images from local dir instead of DB image_url')
    parser.add_argument('--epsilon', type=float, default=0.02, help='approxPolyDP epsilon fraction (default 0.02)')
    parser.add_argument('--debug', action='store_true', help='Emit composite debug sheet')
    parser.add_argument('--output-dir', metavar='PATH', default='output', help='Output root (default: output/)')
    args = parser.parse_args()

    if not args.card_ids and not args.all:
        parser.error('Provide card_ids or --all')

    supabase = create_client(os.environ['VITE_SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])

    if args.all:
        resp = supabase.table('cards').select('id, name, card_layout_type, artwork_bounds, image_url').execute()
    else:
        resp = supabase.table('cards').select('id, name, card_layout_type, artwork_bounds, image_url').in_('id', args.card_ids).execute()

    cards = resp.data or []
    if not cards:
        print('No cards found.')
        sys.exit(0)

    print(f"Processing {len(cards)} card(s)  epsilon={args.epsilon}")
    output_dir = Path(args.output_dir)
    debug_rows: list | None = [] if args.debug else None

    ok = 0
    for card in cards:
        if process_card(card, args.local_dir, args.epsilon, output_dir, debug_rows):
            ok += 1

    print(f"\nDone: {ok}/{len(cards)} succeeded")

    if args.debug and debug_rows:
        write_debug_sheet(debug_rows, output_dir / 'debug-sheet.png')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run unit tests — should pass now**

```bash
cd scripts && python -m pytest tests/test_polygon_utils.py -v
```

Expected:
```
test_renormalize_polygon_identity PASSED
test_renormalize_polygon_offset PASSED
test_renormalize_polygon_corner PASSED
test_compute_coverage_ratio_half PASSED
test_compute_metrics_flags PASSED

5 passed
```

- [ ] **Step 3: Commit**

```bash
git add scripts/extract_subject_polygons.py scripts/tests/test_polygon_utils.py
git commit -m "feat: subject polygon extraction script (rembg + OpenCV)"
```

---

## Task 4: Smoke test on Neo Genesis cards

**Files:**
- Create: `public/polygon-test-data/.gitkeep`

This task validates the script against real cards and populates `public/polygon-test-data/` for the React route.

- [ ] **Step 1: Look up card IDs for the test set**

Run this to find Neo Genesis card IDs in your DB:

```bash
cd scripts && python - <<'EOF'
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
load_dotenv(dotenv_path=Path('..') / '.env.local')
sb = create_client(os.environ['VITE_SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
resp = sb.table('cards').select('id, name, set, number').eq('set', 'neo1').execute()
for c in sorted(resp.data, key=lambda x: int(x['number']) if x['number'].isdigit() else 999):
    print(c['id'], c['number'], c['name'])
EOF
```

Note the IDs for: Lugia (#9), Typhlosion (#20), Pichu (#35), Slowking (#14), Ampharos (#1), Meganium (#10).

- [ ] **Step 2: Run script on test set with debug**

```bash
cd .. && python scripts/extract_subject_polygons.py \
  <lugia_id> <typhlosion_id> <pichu_id> <slowking_id> <ampharos_id> <meganium_id> \
  --debug --output-dir output
```

Expected console output per card:
```
  neo1-9  (Lugia)
    verts=18  cov=0.41  α=224  contours=1  ✓
```

If you see `⚠ fragmented` on Meganium, that's expected — note it but don't fail.

- [ ] **Step 3: Review debug sheet**

Open `output/debug-sheet.png`. For each card verify:
- Panel 1 (alpha mask): subject is clearly white, background is black
- Panel 2 (polygon overlay): green polygon follows the Pokémon silhouette without huge gaps or bleed into background

If any card looks wrong, re-run with lower epsilon (tighter):
```bash
python scripts/extract_subject_polygons.py <card_id> --debug --epsilon 0.01 --output-dir output-tight
```

- [ ] **Step 4: Copy validated JSONs to public dir**

```bash
mkdir -p public/polygon-test-data
cp output/polygons/*.json public/polygon-test-data/
touch public/polygon-test-data/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add public/polygon-test-data/
git commit -m "feat: validated subject polygon JSONs for Neo Genesis test set"
```

---

## Task 5: PolygonTest React route

**Files:**
- Create: `src/routes/PolygonTest.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/routes/PolygonTest.tsx
import { useState, useRef, useCallback, useEffect } from 'react'

interface PolygonData {
  card_id: string
  polygon: [number, number][]
  metrics: {
    vertex_count: number
    coverage_ratio: number
    mean_alpha: number
    contour_count: number
  }
}

const CARD_W = 300
const CARD_H = 418

// Hardcoded test cards matching the smoke-tested set (image_url from pokemontcg.io)
// Update card_id values to match your DB IDs after running Task 4 Step 1
const TEST_CARDS: { card_id: string; name: string; image_url: string }[] = [
  { card_id: 'REPLACE_LUGIA_ID',      name: 'Lugia',      image_url: 'https://images.pokemontcg.io/neo1/9_hires.png' },
  { card_id: 'REPLACE_TYPHLOSION_ID', name: 'Typhlosion', image_url: 'https://images.pokemontcg.io/neo1/20_hires.png' },
  { card_id: 'REPLACE_PICHU_ID',      name: 'Pichu',      image_url: 'https://images.pokemontcg.io/neo1/35_hires.png' },
  { card_id: 'REPLACE_SLOWKING_ID',   name: 'Slowking',   image_url: 'https://images.pokemontcg.io/neo1/14_hires.png' },
  { card_id: 'REPLACE_AMPHAROS_ID',   name: 'Ampharos',   image_url: 'https://images.pokemontcg.io/neo1/1_hires.png' },
  { card_id: 'REPLACE_MEGANIUM_ID',   name: 'Meganium',   image_url: 'https://images.pokemontcg.io/neo1/10_hires.png' },
]

function PolygonCard({
  card,
  showPolygon,
  showHoloPreview,
}: {
  card: { card_id: string; name: string; image_url: string }
  showPolygon: boolean
  showHoloPreview: boolean
}) {
  const [polygonData, setPolygonData] = useState<PolygonData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pointerRef = useRef({ x: 0.5, y: 0.5 })
  const [hue, setHue] = useState(160)

  useEffect(() => {
    fetch(`/polygon-test-data/${card.card_id}.json`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setPolygonData)
      .catch(e => setError(String(e)))
  }, [card.card_id])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    pointerRef.current = { x, y }
    if (showHoloPreview) {
      setHue(Math.round(x * 360))
    }
  }, [showHoloPreview])

  const handleLeave = useCallback(() => {
    pointerRef.current = { x: 0.5, y: 0.5 }
    setHue(160)
  }, [])

  const polygonPoints = polygonData?.polygon
    .map(([px, py]) => `${px * CARD_W},${py * CARD_H}`)
    .join(' ')

  const fillColor = showHoloPreview
    ? `hsla(${hue}, 80%, 60%, 0.3)`
    : 'rgba(0, 255, 128, 0.18)'
  const strokeColor = showHoloPreview
    ? `hsla(${hue}, 90%, 70%, 0.9)`
    : 'rgba(0, 255, 128, 0.9)'

  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ color: '#666', fontSize: 11, marginBottom: 6, fontFamily: 'monospace' }}>
        {card.name} · {card.card_id}
        {polygonData && (
          <span style={{ color: '#444', marginLeft: 12 }}>
            verts={polygonData.metrics.vertex_count}  cov={polygonData.metrics.coverage_ratio.toFixed(2)}  α={polygonData.metrics.mean_alpha.toFixed(0)}
          </span>
        )}
        {error && <span style={{ color: '#c44', marginLeft: 12 }}>⚠ {error}</span>}
      </div>
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleLeave}
        style={{ position: 'relative', width: CARD_W, height: CARD_H, borderRadius: '4.75%/3.5%', overflow: 'hidden', flexShrink: 0 }}
      >
        <img
          src={card.image_url}
          alt={card.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {showPolygon && polygonPoints && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox={`0 0 ${CARD_W} ${CARD_H}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={polygonPoints}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="1.5"
            />
          </svg>
        )}
      </div>
    </div>
  )
}

export default function PolygonTest() {
  const [showPolygon, setShowPolygon] = useState(true)
  const [showHoloPreview, setShowHoloPreview] = useState(false)

  return (
    <div style={{ background: '#1a1a2e', minHeight: '100vh', padding: 32, fontFamily: 'monospace' }}>
      <h2 style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
        SUBJECT POLYGON TEST — hover card to preview holo offset
      </h2>

      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        <label style={{ color: '#888', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showPolygon}
            onChange={e => setShowPolygon(e.target.checked)}
          />
          show polygon
        </label>
        <label style={{ color: '#888', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showHoloPreview}
            onChange={e => setShowHoloPreview(e.target.checked)}
          />
          holo preview (hue tracks pointer)
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        {TEST_CARDS.map(card => (
          <PolygonCard
            key={card.card_id}
            card={card}
            showPolygon={showPolygon}
            showHoloPreview={showHoloPreview}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Fill in real card IDs from Task 4 Step 1**

Replace the `REPLACE_*_ID` placeholders in `TEST_CARDS` with the actual DB IDs you looked up.

- [ ] **Step 3: Commit**

```bash
git add src/routes/PolygonTest.tsx
git commit -m "feat: PolygonTest route — polygon SVG overlay + holo preview"
```

---

## Task 6: Register route in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import and route**

In `src/App.tsx`, add after the `HoloTest` import:

```tsx
import PolygonTest from './routes/PolygonTest'
```

Inside `<Routes>`, add after the `/holo-test` route:

```tsx
<Route path="/polygon-test" element={<PolygonTest />} />
```

- [ ] **Step 2: Start dev server and verify**

```bash
npm run dev
```

Navigate to `http://localhost:5173/polygon-test`.

Expected: page loads, 6 cards displayed, each with polygon overlay (teal outline). Hover a card — polygon fill shifts hue when "holo preview" is checked.

If a card shows `⚠ HTTP 404`: the JSON wasn't copied to `public/polygon-test-data/` — re-run Task 4 Step 4.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: register /polygon-test route"
```

---

## Self-Review Notes

- **Spec § Pipeline step 9 (metrics):** All 4 metrics (vertex_count, coverage_ratio, mean_alpha, contour_count) implemented and tested. ✓
- **Spec § Debug output (3 panels):** original crop / alpha mask / polygon overlay — all 3 panels in `make_debug_row`. ✓
- **Spec § Controls — epsilon slider:** Spec notes this requires pre-run at multiple epsilons. The route omits the slider; instead, re-run the script with `--epsilon <value>` and copy new JSONs. This is a deliberate simplification for the one-off validation context. ✓
- **Spec § Re-normalize:** `renormalize_polygon` + 3 unit tests covering identity, offset, and corner cases. ✓
- **Type consistency:** `polygon: [number, number][]` used consistently in Python output and TypeScript types. ✓
- **No placeholders:** All code is complete. `REPLACE_*_ID` values are intentional — they must be filled from the DB lookup in Task 4 Step 1. ✓

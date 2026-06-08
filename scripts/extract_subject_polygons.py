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
    bx, by, bw, bh = bounds['x'], bounds['y'], bounds['w'], bounds['h']
    def card_to_panel(pt: list[float]) -> tuple[int, int]:
        cx = (pt[0] - bx) / bw * cw
        cy = (pt[1] - by) / bh * ch
        return (int(cx), int(cy))

    pts_px = [card_to_panel(pt) for pt in polygon_card_space]
    if len(pts_px) >= 3:
        d.polygon(pts_px, fill=(0, 255, 128, 77), outline=(0, 255, 128, 255))
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

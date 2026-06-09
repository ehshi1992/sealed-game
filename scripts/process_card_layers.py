#!/usr/bin/env python3
"""
process_card_layers.py

Splits card art into subject and background layers using withoutbg (local model).
Crops to artwork_bounds first, runs segmentation on the crop, then composites
results back onto a full-card-sized canvas.

Uploads both PNGs to Supabase Storage (card-layers bucket) and writes URLs to cards table.

Usage:
  python scripts/process_card_layers.py neo1-1 neo1-2
  python scripts/process_card_layers.py --set neo1
  python scripts/process_card_layers.py --set neo1 --force
"""

import argparse
import io
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv
from PIL import Image
from supabase import create_client
from withoutbg import WithoutBG

load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env.local')

import os

SUPABASE_URL = os.environ['VITE_SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
BUCKET = 'card-layers'
SKIP_LAYOUT_TYPES = {'trainer', 'energy'}

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
model = WithoutBG.opensource()


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def should_skip(card: dict, force: bool) -> str | None:
    """Return skip reason string, or None if card should be processed."""
    if card.get('card_layout_type') in SKIP_LAYOUT_TYPES:
        return card['card_layout_type']
    if not force and card.get('subject_layer_url') and card.get('bg_layer_url'):
        return 'already processed, use --force to re-run'
    return None


def build_storage_paths(card_uuid: str) -> tuple[str, str]:
    return f'{card_uuid}/subject.png', f'{card_uuid}/bg.png'


def bounds_to_pixels(bounds: dict, img_w: int, img_h: int) -> tuple[int, int, int, int]:
    left   = int(bounds['x'] * img_w)
    top    = int(bounds['y'] * img_h)
    right  = int((bounds['x'] + bounds['w']) * img_w)
    bottom = int((bounds['y'] + bounds['h']) * img_h)
    return left, top, right, bottom


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

PUBLIC_DIR = Path(__file__).parent.parent / 'public'

def load_image(image_url: str) -> Image.Image:
    if image_url.startswith('/'):
        local_path = PUBLIC_DIR / image_url.lstrip('/')
        return Image.open(local_path).convert('RGBA')
    resp = requests.get(image_url, timeout=15)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert('RGBA')


def composite_layers(
    original: Image.Image,
    bounds: dict,
) -> tuple[Image.Image, Image.Image]:
    """
    Returns (subject_png, bg_png) as full-card-sized RGBA images.
    Subject: original pixels with withoutbg alpha (subject opaque, bg transparent).
    BG: original pixels with inverted alpha (bg opaque, subject transparent).
    """
    w, h = original.size
    left, top, right, bottom = bounds_to_pixels(bounds, w, h)
    crop = original.crop((left, top, right, bottom)).convert('RGB')

    # Run local model on the crop
    result_rgba = model.remove_background(crop)  # PIL RGBA

    # Split into subject crop and bg crop
    r, g, b, alpha = result_rgba.split()
    orig_crop_rgba = original.crop((left, top, right, bottom))
    orig_r, orig_g, orig_b, _ = orig_crop_rgba.split()

    subject_crop = Image.merge('RGBA', (orig_r, orig_g, orig_b, alpha))

    inv_alpha = alpha.point(lambda v: 255 - v)
    bg_crop = Image.merge('RGBA', (orig_r, orig_g, orig_b, inv_alpha))

    # Paste crops back onto full-card transparent canvases
    subject_full = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    subject_full.paste(subject_crop, (left, top), mask=subject_crop)

    bg_full = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bg_full.paste(bg_crop, (left, top), mask=bg_crop)

    return subject_full, bg_full


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

def fetch_cards_by_set(set_id: str) -> list[dict]:
    res = supabase.from_('cards') \
        .select('id, image_url, card_layout_type, artwork_bounds, subject_layer_url, bg_layer_url') \
        .eq('set', set_id) \
        .execute()
    return res.data


def fetch_card_by_set_number(set_id: str, number: str) -> dict:
    res = supabase.from_('cards') \
        .select('id, image_url, card_layout_type, artwork_bounds, subject_layer_url, bg_layer_url') \
        .eq('set', set_id) \
        .eq('number', number) \
        .single() \
        .execute()
    return res.data


def upload_layer(path: str, data: bytes) -> str:
    supabase.storage.from_(BUCKET).upload(
        path, data,
        file_options={'content-type': 'image/png', 'upsert': 'true'},
    )
    return supabase.storage.from_(BUCKET).get_public_url(path)


def update_card_urls(card_id: str, subject_url: str, bg_url: str) -> None:
    supabase.from_('cards') \
        .update({'subject_layer_url': subject_url, 'bg_layer_url': bg_url}) \
        .eq('id', card_id) \
        .execute()


# ---------------------------------------------------------------------------
# Per-card pipeline
# ---------------------------------------------------------------------------

def process_card(card: dict, force: bool) -> str:
    """Returns 'skipped' | 'processed' | 'error'."""
    skip_reason = should_skip(card, force)
    if skip_reason:
        print(f"  [{card['id'][:8]}] skip ({skip_reason})")
        return 'skipped'

    bounds = card.get('artwork_bounds')
    if not bounds:
        print(f"  [{card['id'][:8]}] skip (no artwork_bounds)")
        return 'skipped'

    print(f"  [{card['id'][:8]}] processing...", end='', flush=True)

    try:
        original = load_image(card['image_url'])
        subject_img, bg_img = composite_layers(original, bounds)
        subject_data = png_bytes(subject_img)
        bg_data = png_bytes(bg_img)
    except Exception as e:
        print(f"\n  [{card['id'][:8]}] composite error: {e}")
        return 'error'

    try:
        subject_path, bg_path = build_storage_paths(card['id'])
        subject_url = upload_layer(subject_path, subject_data)
        bg_url = upload_layer(bg_path, bg_data)
    except Exception as e:
        print(f"\n  [{card['id'][:8]}] upload error: {e}")
        return 'error'

    try:
        update_card_urls(card['id'], subject_url, bg_url)
    except Exception as e:
        print(f"\n  [{card['id'][:8]}] db error: {e}")
        return 'error'

    print(' done')
    return 'processed'


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_card_key(key: str) -> tuple[str, str]:
    """Parse 'neo1-1' → ('neo1', '1'). Splits on first '-'."""
    idx = key.index('-')
    return key[:idx], key[idx + 1:]


def main() -> None:
    parser = argparse.ArgumentParser(description='Process card layers using withoutbg')
    parser.add_argument('card_keys', nargs='*', help='Card keys like neo1-1 neo1-2')
    parser.add_argument('--set', dest='set_id', help='Process all cards in a set')
    parser.add_argument('--force', action='store_true', help='Re-process already-done cards')
    args = parser.parse_args()

    if not args.set_id and not args.card_keys:
        parser.print_help()
        sys.exit(1)
    if args.set_id and args.card_keys:
        print('Error: provide either card keys or --set, not both', file=sys.stderr)
        sys.exit(1)

    if args.set_id:
        cards = fetch_cards_by_set(args.set_id)
    else:
        cards = []
        for key in args.card_keys:
            try:
                set_id, number = parse_card_key(key)
            except ValueError:
                print(f'Error: invalid card key "{key}" (expected set-number, e.g. neo1-1)', file=sys.stderr)
                sys.exit(1)
            cards.append(fetch_card_by_set_number(set_id, number))

    print(f'Found {len(cards)} cards to consider')

    processed = skipped = errors = 0
    for card in cards:
        result = process_card(card, args.force)
        if result == 'processed':
            processed += 1
        elif result == 'skipped':
            skipped += 1
        else:
            errors += 1

    print(f'\nDone — processed: {processed}, skipped: {skipped}, errors: {errors}')


if __name__ == '__main__':
    main()

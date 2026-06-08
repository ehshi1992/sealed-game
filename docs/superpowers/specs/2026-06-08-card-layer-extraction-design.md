# Card Layer Extraction — Design Spec

**Date:** 2026-06-08  
**Status:** approved  
**Goal:** Manually-invoked TypeScript script that calls the remove.bg API to split each card image into a subject layer and background layer, uploads both to Supabase Storage, and writes the URLs back to the `cards` table. These layers are used by the holo shader to apply holo effects to either the subject (reverse holo) or background (standard holo) independently.

---

## Scope

- Pokémon cards only — trainer and energy cards are skipped via `card_layout_type`
- Designed for manual invocation: test on a few cards first, then bulk-process a full set
- Output: two PNGs per card in Supabase Storage, two new URL columns on `cards`

---

## Script: `scripts/process-card-layers.ts`

### CLI

```bash
npx tsx scripts/process-card-layers.ts neo1-1 neo1-2        # specific card IDs
npx tsx scripts/process-card-layers.ts --set neo1           # all cards in a set
npx tsx scripts/process-card-layers.ts --set neo1 --force   # re-process even if already done
```

### Args

| Arg | Description |
|-----|-------------|
| `card_ids` (positional, repeatable) | Process specific cards by ID |
| `--set <set_id>` | Process all non-trainer, non-energy cards in a set |
| `--force` | Re-process cards that already have layer URLs |

### Dependencies

- `sharp` — compositing subject/bg PNGs from alpha mask
- `@supabase/supabase-js` — DB read + Storage upload + DB write
- `dotenv` — `.env.local` loading
- `node-fetch` (or native `fetch` in Node 18+) — remove.bg API call

### Pipeline (per card)

1. **Fetch card** from Supabase — `id`, `image_url`, `card_layout_type`, `subject_layer_url`, `bg_layer_url`
2. **Skip** if `card_layout_type in ('trainer', 'energy')`
3. **Skip** if both layer URLs already set and `--force` not passed
4. **Download original image** from `image_url`
5. **POST to remove.bg API** — send original image bytes, receive RGBA PNG with alpha = subject mask
6. **Composite with `sharp`**:
   - `subject.png` — original RGB pixels, alpha channel = remove.bg alpha (subject opaque, bg transparent)
   - `bg.png` — original RGB pixels, alpha channel = inverted remove.bg alpha (bg opaque, subject transparent)
7. **Upload both PNGs** to Supabase Storage bucket `card-layers`:
   - `card-layers/{card_id}/subject.png`
   - `card-layers/{card_id}/bg.png`
8. **Update DB**: `UPDATE cards SET subject_layer_url = ..., bg_layer_url = ... WHERE id = ...`
9. **Log result** — card ID, status (skipped / processed / error), remove.bg credits remaining if returned in response headers

### Error handling

- remove.bg rate limit or credit exhaustion → log + abort remaining cards (don't silently skip)
- Upload failure → log + skip DB update (card stays unprocessed, safe to retry)
- Composite failure → log + skip upload

---

## Database Changes

### Migration

```sql
ALTER TABLE cards
  ADD COLUMN subject_layer_url text,
  ADD COLUMN bg_layer_url text;
```

No NOT NULL constraint — columns are null until processed. Shader falls back to no-mask behavior when null.

---

## Supabase Storage

- **Bucket:** `card-layers` (public)
- **Path pattern:** `{card_id}/subject.png`, `{card_id}/bg.png`
- Public URLs used directly in `subject_layer_url` / `bg_layer_url` columns

---

## Env Vars

Add to `.env.local`:

```
REMOVE_BG_API_KEY=...
```

Never commit. Add to `.env.local.example` as a placeholder.

---

## remove.bg API

- **Endpoint:** `POST https://api.remove.bg/v1.0/removebg`
- **Auth:** `X-Api-Key: {REMOVE_BG_API_KEY}`
- **Input:** `image_url` form field (URL of card image) or `image_file` (binary upload)
- **Output:** RGBA PNG — alpha channel encodes subject mask
- **Credits:** each call consumes 1 credit; log `X-Credits-Remaining` header after each call

Prefer `image_url` input (no download step needed on our side) if remove.bg can reach pokemontcg.io CDN URLs directly. Fall back to binary upload if URL fetch fails.

---

## Holo Shader Integration (future)

Once layer URLs are populated:

1. Shader reads `subject_layer_url` / `bg_layer_url` from card data
2. Load as WebGL textures
3. **Standard holo** (bg is holo): sample `bg.png` alpha to clip holo pattern — holo visible where `bg_alpha > 0`
4. **Reverse holo** (subject is holo): sample `subject.png` alpha to clip holo pattern — holo visible where `subject_alpha > 0`
5. Shader selects mode based on `holo_type` field on card

---

## Skip Logic

```typescript
const SKIP_LAYOUT_TYPES = new Set(['trainer', 'energy'])

if (SKIP_LAYOUT_TYPES.has(card.card_layout_type)) {
  console.log(`  skip ${card.id} (${card.card_layout_type})`)
  continue
}
```

---

## Logging Format

```
[neo1-1] processing...
[neo1-1] done (credits remaining: 47)
[neo1-2] skip (already processed, use --force to re-run)
[neo1-3] skip (trainer)
[neo1-4] error: remove.bg 402 insufficient credits — aborting
```

---
name: add-tcg-set
description: Add a new Pokémon TCG set (booster pack) to the sealed-game app, OR add a custom/joke card as its own single-card pack. Use whenever the user wants to add a new set, pack, expansion, or custom card — e.g. "add Base Set 2", "add Jungle", "add neo genesis", "add the set with [card name]", "add this custom card as a pack".
---

# Add TCG Set or Custom Card

## Which path?

- **Real pokemontcg.io set** → follow "Real Set" steps (1–4 + holo pipeline)
- **Custom/joke card** (user-provided image, not from the API) → jump to "Custom Card" section

---

## Real Set

### Step 1: Find the set ID

```bash
curl -s "https://api.pokemontcg.io/v2/sets?q=name:<set-name>" \
  -H "X-Api-Key: $POKEMONTCG_API_KEY" | jq '.data[] | {id, name, series}'
```

Or search by card name:

```bash
curl -s "https://api.pokemontcg.io/v2/cards?q=name:<card-name>&pageSize=5" \
  -H "X-Api-Key: $POKEMONTCG_API_KEY" | jq '.data[] | {id: .set.id, set: .set.name, card: .name}'
```

API key is in `.env.local` as `POKEMONTCG_API_KEY`. Load with:

```bash
export $(grep POKEMONTCG_API_KEY .env.local | xargs)
```

Confirm set ID and name with user before proceeding.

### Step 2: Update seed script

Add entry to `SETS` array in `scripts/seed-cards.ts`:

```typescript
{
  setId: 'neo1',
  packName: 'Neo Genesis Booster',
  packPrice: 100,
  packImageUrl: 'https://images.pokemontcg.io/neo1/logo.png',
},
```

`packImageUrl` pattern: `https://images.pokemontcg.io/<setId>/logo.png`. Default price: 100.

### Step 3: Run seed

```bash
npm run seed
```

Idempotent — skips existing cards (`23505` conflict) and packs (name check).

### Step 4: Verify pack

```bash
npx supabase db query --linked "SELECT id, name FROM packs WHERE name = '<pack-name>';"
```

One row expected. Two rows = accidental duplicate — delete the newer one by ID.

### Step 5: Set artwork_bounds (required for holo shader)

The cosmo WebGL shader requires `artwork_bounds` on each card. Without it, `holoMode` is forced to `'none'` and no holo renders.

Check what bounds already exist for a similar set era first:

```bash
npx supabase db query --linked "SELECT number, artwork_bounds FROM cards WHERE set = '<setId>' AND artwork_bounds IS NOT NULL LIMIT 3;"
```

For classic WOTC-era cards (Base, Jungle, Fossil, Neo), a good default per card type:
- Standard Pokémon: `{"x":0.123,"y":0.143,"w":0.742,"h":0.368}`
- Full-art / modern: measure from the card image visually and adjust

Set bounds for all cards in the set via a script (use `scripts/seed-cards.ts` pattern with Supabase client):

```typescript
await supabase.from('cards')
  .update({ artwork_bounds: { x: 0.123, y: 0.143, w: 0.742, h: 0.368 } })
  .eq('set', setId)
  .is('artwork_bounds', null)
```

### Step 6: Run layer extraction

Extracts subject and background PNGs per card, uploads to Supabase Storage `card-layers` bucket, writes `subject_layer_url` + `bg_layer_url` to DB. Requires Python deps:

```bash
pip install -r scripts/requirements-layers.txt
```

Run on the new set:

```bash
python scripts/process_card_layers.py --set <setId>
```

Use `--force` to re-run cards that were already processed. Script skips trainer/energy cards automatically.

After this, `deriveHoloMode` returns `subject_holo` for cards with `subject_layer_url` present, activating the cosmo shader.

### Rarity mapping notes

`RARITY_MAP` in `seed-cards.ts` covers all classic and most modern rarities. If a new string appears in warnings, add it to `RARITY_MAP`.

---

## Custom Card

Use when the user provides a card image that is not on pokemontcg.io (fan-made, joke, photo card, etc.).

### Step 1: Place image

Save the image to `public/cards/<filename>.png`. This path is served at `/<filename>.png` by Vite dev server and Vercel in production.

### Step 2: Write a seed script

Create `scripts/seed-<name>.ts` — do not add custom cards to the main `seed-cards.ts` SETS array.

```typescript
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const card = {
  name: 'Bus',
  set: 'custom1',          // unique set ID for custom cards
  set_name: 'Custom',
  set_code: 'custom1',
  number: '1',
  rarity: 'secret_rare',   // adjust to match card
  holo_type: 'rainbow',    // secret_rare → rainbow; holo_rare → standard; etc.
  card_layout_type: 'standard',
  supertype: 'Pokémon',
  subtypes: [],
  hp: 90,
  types: ['Fighting'],
  artist: 'Ken Sugimori',
  flavor_text: '...',
  national_pokedex_numbers: [152],
  image_url: '/cards/bus_rare.png',
  rarity_raw: 'Rare Secret',
}

const { data: inserted, error: cardError } = await supabase
  .from('cards')
  .upsert(card, { onConflict: 'set,number' })
  .select('id')
  .single()

if (cardError) { console.error(cardError); process.exit(1) }

const { data: existing } = await supabase.from('packs').select('id').eq('name', 'Bus Pack').maybeSingle()
if (!existing) {
  const { error } = await supabase.from('packs').insert({
    name: 'Bus Pack',
    price: 100,
    image_url: '/cards/bus_rare.png',
    card_pool: [inserted.id],
  })
  if (error) { console.error(error); process.exit(1) }
}

console.log('Done')
```

Run with: `npx tsx scripts/seed-<name>.ts`

### Step 3: Set artwork_bounds

Use a separate script (same Supabase client pattern) or inline in the seed script:

```typescript
await supabase.from('cards')
  .update({ artwork_bounds: { x: 0.123, y: 0.143, w: 0.742, h: 0.368 } })
  .eq('set', 'custom1').eq('number', '1')
```

Bounds are fractions of card dimensions (0–1). For classic WOTC layout, `x=0.123, y=0.143, w=0.742, h=0.368` is a good starting point.

### Step 4: Run layer extraction

The `process_card_layers.py` script handles local `image_url` paths starting with `/` — it reads from `public/` on disk. No special flags needed.

```bash
python scripts/process_card_layers.py --set custom1
```

This uploads subject/bg layers to Supabase Storage and enables the cosmo holo shader.

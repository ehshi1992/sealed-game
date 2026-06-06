# Holo Shader & Card Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-card-instance holo seed (x,y offset) that deterministically positions a WebGL cosmo foil shader over the artwork region (full holo) or card border (reverse holo), with artwork bounds precomputed by a CV script.

**Architecture:** A DB migration adds `holo_seed` to `user_collection` and enriched metadata + `artwork_bounds` to `cards`. The open-pack Edge Function generates a seed at pack-open time. A preprocessing script populates `artwork_bounds` using layout templates. A WebGL fragment shader (`useHoloShader` hook) renders the cosmo foil pattern on a canvas overlay inside `HoloCard`, masked to the correct region by `holo_type`.

**Tech Stack:** TypeScript, React 19, WebGL 1.0 (GLSL ES 1.0), Supabase (PostgreSQL + Deno Edge Functions), Vitest + Testing Library, `@supabase/supabase-js`, `dotenv`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/005_holo_seed_and_card_metadata.sql` | Add all new DB columns |
| Modify | `src/types.ts` | Add `ArtworkBounds`, `HoloSeed`, extend `Card` + `CollectionEntry` |
| Modify | `scripts/seed-cards.ts` | Export `deriveLayoutType`, populate new metadata fields |
| Create | `scripts/process-holo-masks.ts` | CV script — template-based artwork bounds computation |
| Modify | `supabase/functions/open-pack/index.ts` | Generate `holo_seed` at pack open |
| Create | `src/components/HoloCard/shaders.ts` | GLSL vertex + fragment shader source strings |
| Create | `src/components/HoloCard/useHoloShader.ts` | WebGL lifecycle hook |
| Modify | `src/components/HoloCard/HoloCard.tsx` | Add `<canvas>`, integrate hook, `holoSeed` prop |
| Modify | `src/components/HoloCard/HoloCard.css` | Style canvas overlay |
| Modify | `src/routes/Collection.tsx` | Pass `holo_seed` from collection entry to HoloCard |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/005_holo_seed_and_card_metadata.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/005_holo_seed_and_card_metadata.sql

-- Per-instance holo seed on user_collection
ALTER TABLE user_collection
  ADD COLUMN IF NOT EXISTS holo_seed JSONB;

-- Layout hint + CV-computed bounds on cards
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS card_layout_type TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS artwork_bounds    JSONB,
  ADD COLUMN IF NOT EXISTS supertype         TEXT,
  ADD COLUMN IF NOT EXISTS subtypes          TEXT[],
  ADD COLUMN IF NOT EXISTS hp                INT,
  ADD COLUMN IF NOT EXISTS types             TEXT[],
  ADD COLUMN IF NOT EXISTS artist            TEXT,
  ADD COLUMN IF NOT EXISTS flavor_text       TEXT,
  ADD COLUMN IF NOT EXISTS national_pokedex_numbers INT[],
  ADD COLUMN IF NOT EXISTS set_name          TEXT,
  ADD COLUMN IF NOT EXISTS set_code          TEXT,
  ADD COLUMN IF NOT EXISTS rarity_raw        TEXT;
```

- [ ] **Step 2: Apply migration via Supabase CLI**

```
npx supabase db push
```

Expected: migration applies with no errors. Verify in Supabase dashboard that `user_collection` has `holo_seed` column and `cards` has `artwork_bounds`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_holo_seed_and_card_metadata.sql
git commit -m "feat: add holo_seed and card metadata columns"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add new types and extend Card + CollectionEntry**

Replace the contents of `src/types.ts` with:

```ts
import type { User } from '@supabase/supabase-js'

export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'holo_rare'
  | 'ultra_rare'
  | 'secret_rare'

export type HoloType = 'none' | 'standard' | 'reverse' | 'full_art' | 'rainbow'

export type HoloMode = 'none' | 'full_holo' | 'reverse_holo'

export type ArtworkBounds = {
  x: number  // 0–1 fraction of card width
  y: number  // 0–1 fraction of card height
  w: number  // 0–1 fraction of card width
  h: number  // 0–1 fraction of card height
}

export type HoloSeed = {
  x: number  // 0–1, shifts cosmo pattern horizontally
  y: number  // 0–1, shifts cosmo pattern vertically
}

export type Card = {
  id: string
  name: string
  set: string
  number: string
  rarity: Rarity
  image_url: string
  holo_type: HoloType
  // New metadata fields (optional — may be null on legacy rows)
  card_layout_type?: string
  artwork_bounds?: ArtworkBounds | null
  supertype?: string | null
  subtypes?: string[] | null
  hp?: number | null
  types?: string[] | null
  artist?: string | null
  flavor_text?: string | null
  national_pokedex_numbers?: number[] | null
  set_name?: string | null
  set_code?: string | null
  rarity_raw?: string | null
}

export type Pack = {
  id: string
  name: string
  price: number
  image_url: string
  card_pool: string[]
}

export type CollectionEntry = {
  id: string
  user_id: string
  card_id: string
  card: Card
  acquired_at: string
  count: number
  holo_seed?: HoloSeed | null  // unique per card instance
}

export type Transaction = {
  id: string
  user_id: string
  type: 'pack_purchase' | 'daily_reward'
  amount: number
  created_at: string
}

export type Profile = {
  id: string
  username: string | null
  currency: number
}

export type AppState = {
  user: User | null
  currency: number
  collection: CollectionEntry[]
}

export type AppAction =
  | { type: 'SET_USER'; user: User | null }
  | { type: 'SET_CURRENCY'; currency: number }
  | { type: 'DEDUCT_CURRENCY'; amount: number }
  | { type: 'SET_COLLECTION'; collection: CollectionEntry[] }
  | { type: 'ADD_CARDS'; cards: CollectionEntry[] }

export type PackOpenResult = {
  cards: Card[]
  newCurrency: number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add ArtworkBounds, HoloSeed, HoloMode types; extend Card and CollectionEntry"
```

---

## Task 3: Enrich seed-cards.ts with metadata fields

**Files:**
- Modify: `scripts/seed-cards.ts`
- Create: `scripts/__tests__/seed-cards.test.ts`

The PokémonTCG API v2 returns `supertype`, `subtypes`, `hp`, `types`, `artist`, `flavorText`, `nationalPokedexNumbers`, `set.name`, `set.id`, and `rarity`. Map all of these into the card row. Extract `deriveLayoutType` as an exported pure function so it can be tested.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/seed-cards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveLayoutType } from '../seed-cards'

describe('deriveLayoutType', () => {
  it('returns energy for Energy supertype', () => {
    expect(deriveLayoutType('Energy', [], '')).toBe('energy')
  })
  it('returns trainer for Trainer supertype', () => {
    expect(deriveLayoutType('Trainer', [], '')).toBe('trainer')
  })
  it('returns full_art for Secret rarity', () => {
    expect(deriveLayoutType('Pokémon', [], 'Rare Secret')).toBe('full_art')
  })
  it('returns full_art for Full Art rarity', () => {
    expect(deriveLayoutType('Pokémon', [], 'Rare Ultra Full Art')).toBe('full_art')
  })
  it('returns v_vmax for VMAX subtype', () => {
    expect(deriveLayoutType('Pokémon', ['VMAX'], 'Rare Holo VMAX')).toBe('v_vmax')
  })
  it('returns v_vmax for VSTAR subtype', () => {
    expect(deriveLayoutType('Pokémon', ['VSTAR'], 'Rare Holo VSTAR')).toBe('v_vmax')
  })
  it('returns ex_gx for GX subtype', () => {
    expect(deriveLayoutType('Pokémon', ['GX'], 'Rare Holo GX')).toBe('ex_gx')
  })
  it('returns ex_gx for V subtype', () => {
    expect(deriveLayoutType('Pokémon', ['V'], 'Rare Holo V')).toBe('ex_gx')
  })
  it('returns standard for plain Basic Pokémon', () => {
    expect(deriveLayoutType('Pokémon', ['Basic'], 'Rare Holo')).toBe('standard')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
npx vitest run scripts/__tests__/seed-cards.test.ts
```

Expected: FAIL — `deriveLayoutType` not exported.

- [ ] **Step 3: Update seed-cards.ts**

Replace `scripts/seed-cards.ts` with:

```ts
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const RARITY_MAP: Record<string, string> = {
  'Common': 'common',
  'Uncommon': 'uncommon',
  'Rare': 'rare',
  'Rare Holo': 'holo_rare',
  'Rare Ultra': 'ultra_rare',
  'Rare Secret': 'secret_rare',
  'Rare Rainbow': 'secret_rare',
  'Rare Holo EX': 'ultra_rare',
  'Rare Holo GX': 'ultra_rare',
  'Rare Holo V': 'ultra_rare',
  'Rare Holo VMAX': 'ultra_rare',
}

const HOLO_MAP: Record<string, string> = {
  'common': 'none',
  'uncommon': 'none',
  'rare': 'standard',
  'holo_rare': 'standard',
  'ultra_rare': 'full_art',
  'secret_rare': 'rainbow',
}

export function deriveLayoutType(supertype: string, subtypes: string[], rarity: string): string {
  if (supertype === 'Energy') return 'energy'
  if (supertype === 'Trainer') return 'trainer'
  if (rarity.includes('Secret') || rarity.includes('Full Art')) return 'full_art'
  if (subtypes.some(s => ['VMAX', 'VSTAR'].includes(s))) return 'v_vmax'
  if (subtypes.some(s => ['V', 'EX', 'GX', 'ex'].includes(s))) return 'ex_gx'
  return 'standard'
}

type RawCard = {
  id: string
  name: string
  supertype?: string
  subtypes?: string[]
  hp?: string
  types?: string[]
  number: string
  artist?: string
  flavorText?: string
  nationalPokedexNumbers?: number[]
  set: { id: string; name: string }
  rarity?: string
  images: { large: string }
}

async function fetchCards(setId: string): Promise<RawCard[]> {
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250`,
    { headers: { 'X-Api-Key': process.env.POKEMONTCG_API_KEY! } }
  )
  const json = await res.json()
  return json.data as RawCard[]
}

async function seed() {
  const setId = 'base1'
  const raw = await fetchCards(setId)

  const cards = raw.map((c) => {
    const rarity = RARITY_MAP[c.rarity ?? ''] ?? 'common'
    const supertype = c.supertype ?? 'Pokémon'
    const subtypes = c.subtypes ?? []
    return {
      name: c.name,
      set: c.set.id,
      number: c.number,
      rarity,
      image_url: c.images.large,
      holo_type: HOLO_MAP[rarity] ?? 'none',
      card_layout_type: deriveLayoutType(supertype, subtypes, c.rarity ?? ''),
      supertype,
      subtypes,
      hp: c.hp ? parseInt(c.hp, 10) : null,
      types: c.types ?? null,
      artist: c.artist ?? null,
      flavor_text: c.flavorText ?? null,
      national_pokedex_numbers: c.nationalPokedexNumbers ?? null,
      set_name: c.set.name,
      set_code: c.set.id,
      rarity_raw: c.rarity ?? null,
    }
  })

  console.log(`Inserting ${cards.length} cards from set ${setId}…`)

  const { error: cardError } = await supabase
    .from('cards')
    .insert(cards)

  if (cardError && cardError.code !== '23505') { console.error(cardError); process.exit(1) }

  const { data: fetchedCards, error: fetchError } = await supabase
    .from('cards')
    .select('id')
    .eq('set', setId)

  if (fetchError) { console.error(fetchError); process.exit(1) }

  const cardIds = fetchedCards!.map((c: { id: string }) => c.id)

  const { error: packError } = await supabase
    .from('packs')
    .insert({
      name: 'Base Set Booster',
      price: 100,
      image_url: 'https://images.pokemontcg.io/base1/logo.png',
      card_pool: cardIds,
    })

  if (packError) { console.error(packError); process.exit(1) }

  console.log('Seed complete.')
}

seed()
```

- [ ] **Step 4: Run test — verify it passes**

```
npx vitest run scripts/__tests__/seed-cards.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-cards.ts scripts/__tests__/seed-cards.test.ts
git commit -m "feat: enrich seed-cards with full TCG metadata and card_layout_type"
```

---

## Task 4: CV Artwork Bounds Script

**Files:**
- Create: `scripts/process-holo-masks.ts`
- Create: `scripts/__tests__/process-holo-masks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/process-holo-masks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getLayoutBounds } from '../process-holo-masks'

describe('getLayoutBounds', () => {
  it('returns standard bounds for unknown layout type', () => {
    expect(getLayoutBounds('unknown')).toEqual({ x: 0.07, y: 0.11, w: 0.86, h: 0.36 })
  })
  it('returns full coverage for full_art', () => {
    expect(getLayoutBounds('full_art')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
  it('returns top-anchored bounds for v_vmax', () => {
    const b = getLayoutBounds('v_vmax')
    expect(b.x).toBe(0)
    expect(b.y).toBe(0)
    expect(b.h).toBe(0.65)
  })
  it('returns trainer bounds', () => {
    expect(getLayoutBounds('trainer')).toEqual({ x: 0.20, y: 0.12, w: 0.60, h: 0.28 })
  })
  it('returns energy bounds same as trainer', () => {
    expect(getLayoutBounds('energy')).toEqual(getLayoutBounds('trainer'))
  })
  it('returns wider art window for ex_gx vs standard', () => {
    const ex = getLayoutBounds('ex_gx')
    const std = getLayoutBounds('standard')
    expect(ex.h).toBeGreaterThan(std.h)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
npx vitest run scripts/__tests__/process-holo-masks.test.ts
```

Expected: FAIL — `getLayoutBounds` not found.

- [ ] **Step 3: Create process-holo-masks.ts**

```ts
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import type { ArtworkBounds } from '../src/types'

const LAYOUT_DEFAULTS: Record<string, ArtworkBounds> = {
  standard: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
  ex_gx:    { x: 0.07, y: 0.09, w: 0.86, h: 0.40 },
  v_vmax:   { x: 0.00, y: 0.00, w: 1.00, h: 0.65 },
  full_art:  { x: 0.00, y: 0.00, w: 1.00, h: 1.00 },
  trainer:  { x: 0.20, y: 0.12, w: 0.60, h: 0.28 },
  energy:   { x: 0.20, y: 0.12, w: 0.60, h: 0.28 },
}

export function getLayoutBounds(layoutType: string): ArtworkBounds {
  return LAYOUT_DEFAULTS[layoutType] ?? LAYOUT_DEFAULTS.standard
}

async function main() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, card_layout_type')
    .is('artwork_bounds', null)

  if (error) { console.error(error); process.exit(1) }
  if (!cards || cards.length === 0) { console.log('All cards already have artwork_bounds.'); return }

  console.log(`Processing ${cards.length} cards…`)

  for (const card of cards) {
    const bounds = getLayoutBounds(card.card_layout_type ?? 'standard')
    const { error: updateError } = await supabase
      .from('cards')
      .update({ artwork_bounds: bounds })
      .eq('id', card.id)

    if (updateError) {
      console.error(`Failed card ${card.id}:`, updateError.message)
    } else {
      console.log(`  ${card.id} → ${JSON.stringify(bounds)}`)
    }
  }

  console.log('Done.')
}

main()
```

- [ ] **Step 4: Run test — verify it passes**

```
npx vitest run scripts/__tests__/process-holo-masks.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/process-holo-masks.ts scripts/__tests__/process-holo-masks.test.ts
git commit -m "feat: add process-holo-masks script with template-based artwork bounds"
```

---

## Task 5: Add holo_seed to open-pack Edge Function

**Files:**
- Modify: `supabase/functions/open-pack/index.ts` (lines 122–127)

- [ ] **Step 1: Update collectionRows to include holo_seed**

In `supabase/functions/open-pack/index.ts`, replace the `collectionRows` block:

```ts
// BEFORE (around line 122):
const collectionRows = selectedIds.map(cardId => ({
  user_id: user.id,
  card_id: cardId,
}))
```

```ts
// AFTER:
const collectionRows = selectedIds.map(cardId => ({
  user_id: user.id,
  card_id: cardId,
  holo_seed: { x: Math.random(), y: Math.random() },
}))
```

- [ ] **Step 2: Deploy edge function**

```
npx supabase functions deploy open-pack
```

Expected: deploys successfully.

- [ ] **Step 3: Verify manually** — Open a pack in the app, then check `user_collection` in Supabase dashboard. New rows should have `holo_seed` with an `{x, y}` object.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/open-pack/index.ts
git commit -m "feat: generate holo_seed per card instance at pack open"
```

---

## Task 6: GLSL Shaders

> **UPDATED 2026-06-06 (v3):** Spiral galaxy elements redesigned from `spiralSDF` analytical function to **pre-generated texture** approach. Spiral textures are generated once in JS (log-spiral arm placement + Fermat dot scatter, same algorithm as `cosmo-bitmap-preview.html`), uploaded as two 128×128 WebGL textures (`u_spiral_tex_primary`, `u_spiral_tex_accent`), and sampled per scattered instance. This produces correct dot-cluster galaxy look (reference: eBay 326224249707) which analytical per-pixel SDF cannot replicate cheaply. Locked params: PRIMARY = {numArms:2, N:300, b:0.22, armSpread:0.28, minDotR:0.3, maxDotR:10, sizePower:2.5}, ACCENT = {numArms:2, N:220, b:0.28, armSpread:0.16, minDotR:0.4, maxDotR:12, sizePower:3.0}.

**Uniforms (updated — add `u_holo_density` to `useHoloShader` hook in Task 7):**

```glsl
uniform vec2  u_resolution;
uniform vec2  u_seed_offset;    // holo_seed {x,y} — shifts entire orb grid
uniform vec2  u_pointer;        // normalized mouse/touch [0,1]
uniform float u_time;
uniform int   u_holo_mode;      // 0=none, 1=full_holo, 2=reverse_holo
uniform vec4  u_artwork_bounds; // xywh [0,1] fractions
uniform int   u_holo_density;   // 0=low(reverse), 1=medium(standard), 2=high(full_art), 3=very_high(rainbow)
```

**Density → cell sizes per holo_type:**

| `u_holo_density` | `holo_type` | Large cell | Medium cell | Small cell |
|---|---|---|---|---|
| 0 | `reverse` | 0.20 | 0.09 | 0.035 |
| 1 | `standard` | 0.16 | 0.07 | 0.028 |
| 2 | `full_art` | 0.13 | 0.055 | 0.022 |
| 3 | `rainbow` | 0.10 | 0.045 | 0.018 |

**Files:**
- Create: `src/components/HoloCard/shaders.ts`

- [ ] **Step 1: Create shaders.ts**

```ts
export const VERT_SRC = /* glsl */`
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

export const FRAG_SRC = /* glsl */`
  precision mediump float;

  uniform vec2      u_resolution;
  uniform vec2      u_seed_offset;
  uniform vec2      u_pointer;
  uniform float     u_time;
  uniform int       u_holo_mode;
  uniform vec4      u_artwork_bounds;
  uniform int       u_holo_density;
  uniform sampler2D u_spiral_tex_primary;
  uniform sampler2D u_spiral_tex_accent;

  // --- Hashing ---

  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  vec2 hash2(vec2 p) {
    return vec2(
      fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
      fract(sin(dot(p, vec2(269.5, 183.3))) * 37623.1122)
    );
  }

  // --- Colour ---

  vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if      (h < 0.1667) rgb = vec3(c, x, 0.0);
    else if (h < 0.3333) rgb = vec3(x, c, 0.0);
    else if (h < 0.5000) rgb = vec3(0.0, c, x);
    else if (h < 0.6667) rgb = vec3(0.0, x, c);
    else if (h < 0.8333) rgb = vec3(x, 0.0, c);
    else                 rgb = vec3(c, 0.0, x);
    return rgb + m;
  }

  // --- Orb layer: draws circles from a hash grid at given cell size ---
  // Returns vec4(rgb, alpha) — alpha=0 if no orb hit

  vec4 orbLayer(vec2 seeded, float cellSize, float minR, float maxR,
                float tiltHue, float angleIntensity) {
    vec2 cell = floor(seeded / cellSize);
    vec4 result = vec4(0.0);
    // Check 3x3 neighbourhood so orbs near cell borders aren't clipped
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 nb = cell + vec2(float(dx), float(dy));
        vec2 rnd = hash2(nb);
        // Circle centre: random offset within cell
        vec2 centre = (nb + rnd) * cellSize;
        float r = minR + rnd.x * (maxR - minR);
        float d = length(seeded - centre);
        if (d < r) {
          // Per-orb hue: global tilt hue + small hash offset
          float orbHue = mod(tiltHue + hash1(nb) * 0.35, 1.0);
          // Brightness: brighter toward orb centre, boosted by tilt intensity
          float edge   = smoothstep(r, r * 0.3, d);
          float bright = 0.45 + edge * 0.45 + angleIntensity * 0.2;
          vec3  col    = hsl2rgb(orbHue, 1.0, clamp(bright, 0.0, 1.0));
          result = vec4(col, edge * (0.7 + angleIntensity * 0.3));
        }
      }
    }
    return result;
  }

  // --- Background sparkle field ---

  float sparkleField(vec2 seeded, float scale) {
    vec2 cell = floor(seeded * scale);
    vec2 rnd  = hash2(cell);
    // Only ~25% of cells get a sparkle dot
    if (rnd.x > 0.25) return 0.0;
    vec2 centre = (cell + rnd) / scale;
    float d = length(seeded - centre);
    return smoothstep(0.004, 0.0, d);
  }

  // --- Spiral galaxy (rare, ~3 per card) ---

  float spiralSDF(vec2 seeded, vec2 centre, float spin) {
    vec2 delta = seeded - centre;
    float r   = length(delta);
    float ang = atan(delta.y, delta.x);
    float spiral = mod(ang + spin * r * 8.0 - u_time * 0.3, 6.2832) / 6.2832;
    return smoothstep(0.12, 0.0, r) * (1.0 - smoothstep(0.0, 0.15, abs(spiral - 0.5)));
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    uv.y = 1.0 - uv.y;

    bool in_art = uv.x >= u_artwork_bounds.x &&
                  uv.x <= u_artwork_bounds.x + u_artwork_bounds.z &&
                  uv.y >= u_artwork_bounds.y &&
                  uv.y <= u_artwork_bounds.y + u_artwork_bounds.w;

    if (u_holo_mode == 1 && !in_art) { gl_FragColor = vec4(0.0); return; }
    if (u_holo_mode == 2 &&  in_art) { gl_FragColor = vec4(0.0); return; }
    if (u_holo_mode == 0)             { gl_FragColor = vec4(0.0); return; }

    // Parallax depth shift
    vec2 seeded = uv + u_seed_offset + (u_pointer - 0.5) * 0.05;

    // Global tilt hue: pointer x/y drives the dominant hue shift seen across all orbs
    // (matches real foil: tilt left = red band, tilt right = blue band)
    float tiltHue       = mod(u_pointer.x * 0.8 + u_pointer.y * 0.3 + u_time * 0.02, 1.0);
    float angleIntensity = length(u_pointer - vec2(0.5)) * 1.8;

    // Cell sizes per density level
    float largeCell, medCell, smallCell;
    if (u_holo_density == 3) {
      largeCell = 0.10; medCell = 0.045; smallCell = 0.018;
    } else if (u_holo_density == 2) {
      largeCell = 0.13; medCell = 0.055; smallCell = 0.022;
    } else if (u_holo_density == 1) {
      largeCell = 0.16; medCell = 0.070; smallCell = 0.028;
    } else {
      largeCell = 0.20; medCell = 0.090; smallCell = 0.035;
    }

    // --- Orb layers (large → medium → small, painter's algorithm) ---
    vec4 oLarge  = orbLayer(seeded, largeCell,  largeCell*0.25, largeCell*0.45, tiltHue, angleIntensity);
    vec4 oMedium = orbLayer(seeded, medCell,    medCell*0.28,   medCell*0.48,   tiltHue, angleIntensity);
    vec4 oSmall  = orbLayer(seeded, smallCell,  smallCell*0.30, smallCell*0.50, tiltHue, angleIntensity);

    // Composite orb layers (each layer punches through darker ones)
    vec3  orbCol   = vec3(0.0);
    float orbAlpha = 0.0;
    if (oLarge.a  > 0.0) { orbCol = oLarge.rgb;  orbAlpha = oLarge.a;  }
    if (oMedium.a > 0.0) { orbCol = mix(orbCol, oMedium.rgb, oMedium.a); orbAlpha = max(orbAlpha, oMedium.a); }
    if (oSmall.a  > 0.0) { orbCol = mix(orbCol, oSmall.rgb,  oSmall.a);  orbAlpha = max(orbAlpha, oSmall.a);  }

    // --- Background sparkle field (fine dots) ---
    float sp    = sparkleField(seeded, 280.0);
    vec3  spCol = hsl2rgb(mod(tiltHue + 0.1, 1.0), 0.9, 0.8);

    // --- Spiral galaxies: texture-sampled dot-cluster spirals ---
    // 5 primary (large, D-params) + 4 accent (tight, B-params) instances per card.
    // Positions deterministic from u_seed_offset hash.
    float spiralAcc = 0.0;
    float spiralHueOff = 0.0;
    for (int i = 0; i < 5; i++) {
      vec2  centre  = hash2(u_seed_offset + vec2(float(i) * 7.3, float(i) * 3.1)) * 0.85 + 0.075;
      float scale   = 0.14 + hash1(centre) * 0.08;
      vec2  localUV = (seeded - centre) / scale + 0.5;
      if (localUV.x >= 0.0 && localUV.x <= 1.0 && localUV.y >= 0.0 && localUV.y <= 1.0) {
        float v = texture2D(u_spiral_tex_primary, localUV).r;
        if (v > spiralAcc) { spiralAcc = v; spiralHueOff = hash1(centre + vec2(0.1)) * 0.4; }
      }
    }
    for (int i = 0; i < 4; i++) {
      vec2  centre  = hash2(u_seed_offset + vec2(float(i) * 4.7 + 33.0, float(i) * 8.9)) * 0.80 + 0.10;
      float scale   = 0.08 + hash1(centre + vec2(0.5)) * 0.06;
      vec2  localUV = (seeded - centre) / scale + 0.5;
      if (localUV.x >= 0.0 && localUV.x <= 1.0 && localUV.y >= 0.0 && localUV.y <= 1.0) {
        float v = texture2D(u_spiral_tex_accent, localUV).r * 0.85;
        spiralAcc = max(spiralAcc, v);
      }
    }
    spiralAcc = clamp(spiralAcc, 0.0, 1.0);
    vec3 spiralCol = hsl2rgb(mod(tiltHue + spiralHueOff, 1.0), 1.0, 0.65);

    // --- Final composite ---
    // Background is transparent (dark card shows through between orbs)
    vec3  col   = orbCol;
    float alpha = orbAlpha;

    // Add sparkle dots on top
    col   = mix(col,   spCol,    sp * 0.9);
    alpha = max(alpha, sp * (0.5 + angleIntensity * 0.4));

    // Add spiral overlay
    col   = mix(col,      spiralCol, spiralAcc * 0.6);
    alpha = max(alpha, spiralAcc * 0.5);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`
```

- [ ] **Step 2: Add spiral texture generators to shaders.ts**

Append to `src/components/HoloCard/shaders.ts`:

```ts
// Spiral texture parameters (locked from cosmo-bitmap-preview.html design session)
const SPIRAL_TEX_SIZE = 128

interface SpiralParams {
  numArms: number; N: number; b: number
  armSpread: number; minDotR: number; maxDotR: number; sizePower: number
}

const SPIRAL_PRIMARY: SpiralParams = { numArms:2, N:300, b:0.22, armSpread:0.28, minDotR:0.3, maxDotR:10, sizePower:2.5 }
const SPIRAL_ACCENT:  SpiralParams = { numArms:2, N:220, b:0.28, armSpread:0.16, minDotR:0.4, maxDotR:12, sizePower:3.0 }

function _hash1(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}
function _smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function buildSpiralDots(p: SpiralParams): Array<{r:number,theta:number,dotR:number,brightness:number}> {
  const dots = []
  const maxTheta = 2.8 * Math.PI
  const outerR = 0.88
  for (let arm = 0; arm < p.numArms; arm++) {
    const armOffset = (arm / p.numArms) * 2 * Math.PI
    const perArm = Math.floor(p.N / p.numArms)
    for (let i = 0; i < perArm; i++) {
      const t = (i + 1) / perArm
      const rBase = Math.exp(p.b * t * maxTheta / (2 * Math.PI)) - 1
      const rNorm = rBase / (Math.exp(p.b * maxTheta / (2 * Math.PI)) - 1) * outerR
      if (rNorm < 0.03) continue
      const scatter = (_hash1(i * 3.7 + arm * 91, i * 2.1) * 2 - 1) * p.armSpread
      const theta   = t * maxTheta + armOffset + scatter / Math.max(rNorm, 0.1)
      const rSc     = (_hash1(i * 5.3 + arm * 17, i + 3) * 2 - 1) * 0.06
      const r       = Math.max(0.02, Math.min(outerR, rNorm + rSc))
      const rnd     = _hash1(i * 7.1 + arm * 53, i * 4.3 + 1)
      const tSize   = Math.pow(rnd * 0.65 + (r / outerR) * 0.35, p.sizePower)
      dots.push({ r, theta, dotR: p.minDotR + (p.maxDotR - p.minDotR) * tSize, brightness: 0.35 + tSize * 0.65 })
    }
  }
  // Extras: scattered large orbs
  const extras = Math.floor(p.N * 0.12)
  for (let i = 0; i < extras; i++) {
    const r   = (0.15 + _hash1(i * 11.3, i * 6.7) * 0.75) * outerR
    const th  = _hash1(i * 3.9, i + 77) * 2 * Math.PI
    const tPow = Math.pow(_hash1(i * 2.1, i * 8.4), p.sizePower * 0.6)
    dots.push({ r, theta: th, dotR: p.minDotR * 1.5 + p.maxDotR * 0.6 * tPow, brightness: 0.5 + tPow * 0.5 })
  }
  return dots
}

export function generateSpiralTexture(params: SpiralParams, size = SPIRAL_TEX_SIZE): Uint8Array {
  const buf = new Float32Array(size * size)
  const cx = size / 2, cy = size / 2, scale = size * 0.46
  for (const { r, theta, dotR, brightness } of buildSpiralDots(params)) {
    const px = cx + r * scale * Math.cos(theta)
    const py = cy + r * scale * Math.sin(theta)
    const sr = Math.ceil(dotR + 1.5)
    for (let dy = -sr; dy <= sr; dy++) {
      for (let dx = -sr; dx <= sr; dx++) {
        const ix = Math.round(px + dx), iy = Math.round(py + dy)
        if (ix < 0 || ix >= size || iy < 0 || iy >= size) continue
        const v = _smoothstep(dotR, dotR * 0.2, Math.sqrt(dx*dx + dy*dy)) * brightness
        const idx = iy * size + ix
        if (v > buf[idx]) buf[idx] = v
      }
    }
  }
  const out = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(buf[i] * 255)
    out[i*4+0] = v; out[i*4+1] = v; out[i*4+2] = v; out[i*4+3] = 255
  }
  return out
}

export { SPIRAL_PRIMARY, SPIRAL_ACCENT, SPIRAL_TEX_SIZE }
```

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/HoloCard/shaders.ts
git commit -m "feat: add cosmo foil GLSL shaders — orb hash grid, texture-sampled dot-cluster spirals, sparkles"
```

---

## Task 7: useHoloShader Hook

**Files:**
- Create: `src/components/HoloCard/useHoloShader.ts`
- Create: `src/components/HoloCard/__tests__/useHoloShader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/HoloCard/__tests__/useHoloShader.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useHoloShader } from '../useHoloShader'

const makeGLMock = () => ({
  createShader: vi.fn(() => ({})),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  getShaderInfoLog: vi.fn(() => ''),
  createProgram: vi.fn(() => ({})),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  getProgramInfoLog: vi.fn(() => ''),
  useProgram: vi.fn(),
  createBuffer: vi.fn(() => ({})),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  getAttribLocation: vi.fn(() => 0),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  enable: vi.fn(),
  blendFunc: vi.fn(),
  getUniformLocation: vi.fn(() => ({})),
  viewport: vi.fn(),
  clear: vi.fn(),
  uniform2f: vi.fn(),
  uniform1f: vi.fn(),
  uniform1i: vi.fn(),
  uniform4f: vi.fn(),
  drawArrays: vi.fn(),
  getExtension: vi.fn(() => null),
  deleteShader: vi.fn(),
  COLOR_BUFFER_BIT: 0x4000,
  VERTEX_SHADER: 0x8B31,
  FRAGMENT_SHADER: 0x8B30,
  COMPILE_STATUS: 0x8B81,
  LINK_STATUS: 0x8B82,
  ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88B4,
  FLOAT: 0x1406,
  TRIANGLES: 0x0004,
  BLEND: 0x0BE2,
  SRC_ALPHA: 0x0302,
  ONE_MINUS_SRC_ALPHA: 0x0303,
})

describe('useHoloShader', () => {
  let glMock: ReturnType<typeof makeGLMock>

  beforeEach(() => {
    glMock = makeGLMock()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(glMock as any)
  })

  it('initialises WebGL and calls drawArrays', async () => {
    const { result } = renderHook(() => {
      const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
      useHoloShader(canvasRef, {
        seedOffset: { x: 0.3, y: 0.7 },
        artworkBounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
        holoMode: 'full_holo',
        pointer: { x: 0.5, y: 0.5 },
      })
      return canvasRef
    })
    // Allow useEffect to run
    await new Promise(r => setTimeout(r, 0))
    expect(glMock.drawArrays).toHaveBeenCalled()
  })

  it('does not throw when canvas ref is null', () => {
    expect(() => {
      renderHook(() => {
        const canvasRef = useRef<HTMLCanvasElement>(null as any)
        useHoloShader(canvasRef, {
          seedOffset: { x: 0, y: 0 },
          artworkBounds: null,
          holoMode: 'none',
          pointer: { x: 0.5, y: 0.5 },
        })
      })
    }).not.toThrow()
  })

  it('does not throw when WebGL is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => {
      renderHook(() => {
        const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
        useHoloShader(canvasRef, {
          seedOffset: { x: 0, y: 0 },
          artworkBounds: null,
          holoMode: 'full_holo',
          pointer: { x: 0.5, y: 0.5 },
        })
      })
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
npx vitest run src/components/HoloCard/__tests__/useHoloShader.test.ts
```

Expected: FAIL — `useHoloShader` not found.

- [ ] **Step 3: Create useHoloShader.ts**

```ts
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { VERT_SRC, FRAG_SRC } from './shaders'
import type { ArtworkBounds, HoloMode, HoloSeed, HoloType } from '../../types'
import { generateSpiralTexture, SPIRAL_PRIMARY, SPIRAL_ACCENT, SPIRAL_TEX_SIZE } from './shaders'

interface HoloShaderOpts {
  seedOffset: HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode: HoloMode
  holoType: HoloType   // drives u_holo_density
  pointer: { x: number; y: number }
}

type UniformLocations = {
  u_resolution: WebGLUniformLocation | null
  u_seed_offset: WebGLUniformLocation | null
  u_pointer: WebGLUniformLocation | null
  u_time: WebGLUniformLocation | null
  u_holo_mode: WebGLUniformLocation | null
  u_artwork_bounds: WebGLUniformLocation | null
  u_holo_density: WebGLUniformLocation | null
  u_spiral_tex_primary: WebGLUniformLocation | null
  u_spiral_tex_accent: WebGLUniformLocation | null
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function initGL(
  canvas: HTMLCanvasElement
): { gl: WebGLRenderingContext; program: WebGLProgram; uniforms: UniformLocations } | null {
  const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
  if (!gl) return null

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  if (!vert || !frag) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  )
  const posLoc = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  const uniforms: UniformLocations = {
    u_resolution:         gl.getUniformLocation(program, 'u_resolution'),
    u_seed_offset:        gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:            gl.getUniformLocation(program, 'u_pointer'),
    u_time:               gl.getUniformLocation(program, 'u_time'),
    u_holo_mode:          gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds:     gl.getUniformLocation(program, 'u_artwork_bounds'),
    u_holo_density:       gl.getUniformLocation(program, 'u_holo_density'),
    u_spiral_tex_primary: gl.getUniformLocation(program, 'u_spiral_tex_primary'),
    u_spiral_tex_accent:  gl.getUniformLocation(program, 'u_spiral_tex_accent'),
  }

  // Upload spiral textures once at init
  function uploadTex(unit: number, data: Uint8Array, size: number): WebGLTexture | null {
    const tex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }
  uploadTex(1, generateSpiralTexture(SPIRAL_PRIMARY, SPIRAL_TEX_SIZE), SPIRAL_TEX_SIZE)
  uploadTex(2, generateSpiralTexture(SPIRAL_ACCENT,  SPIRAL_TEX_SIZE), SPIRAL_TEX_SIZE)
  gl.useProgram(program)
  gl.uniform1i(uniforms.u_spiral_tex_primary, 1)
  gl.uniform1i(uniforms.u_spiral_tex_accent,  2)

  return { gl, program, uniforms }
}

const HOLO_MODE_INT: Record<HoloMode, number> = {
  none: 0,
  full_holo: 1,
  reverse_holo: 2,
}

const HOLO_DENSITY_INT: Record<HoloType, number> = {
  none:     0,
  reverse:  0,
  standard: 1,
  full_art: 2,
  rainbow:  3,
}

export function useHoloShader(
  canvasRef: RefObject<HTMLCanvasElement>,
  opts: HoloShaderOpts
) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const glCtx = initGL(canvas)
    if (!glCtx) return

    const { gl, uniforms } = glCtx
    const startTime = performance.now()
    let rafId: number

    function render() {
      const { seedOffset, artworkBounds, holoMode, holoType, pointer } = optsRef.current
      const bounds = artworkBounds ?? { x: 0, y: 0, w: 1, h: 1 }

      gl.viewport(0, 0, canvas!.width, canvas!.height)
      gl.clear(gl.COLOR_BUFFER_BIT)

      const elapsed = (performance.now() - startTime) / 1000
      gl.uniform2f(uniforms.u_resolution, canvas!.width, canvas!.height)
      gl.uniform2f(uniforms.u_seed_offset, seedOffset.x, seedOffset.y)
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y)
      gl.uniform1f(uniforms.u_time, elapsed)
      gl.uniform1i(uniforms.u_holo_mode, HOLO_MODE_INT[holoMode])
      gl.uniform4f(uniforms.u_artwork_bounds, bounds.x, bounds.y, bounds.w, bounds.h)
      gl.uniform1i(uniforms.u_holo_density, HOLO_DENSITY_INT[holoType])

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(rafId)
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext()
    }
  }, [canvasRef])
}
```

- [ ] **Step 4: Run test — verify it passes**

```
npx vitest run src/components/HoloCard/__tests__/useHoloShader.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/HoloCard/useHoloShader.ts src/components/HoloCard/__tests__/useHoloShader.test.ts
git commit -m "feat: add useHoloShader WebGL hook with cosmo foil shader"
```

---

## Task 8: Update HoloCard Component

**Files:**
- Modify: `src/components/HoloCard/HoloCard.tsx`
- Modify: `src/components/HoloCard/HoloCard.css`
- Create: `src/components/HoloCard/__tests__/HoloCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/HoloCard/__tests__/HoloCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import HoloCard from '../HoloCard'
import type { Card } from '../../../types'

const holoCard: Card = {
  id: '1',
  name: 'Charizard',
  set: 'base1',
  number: '4',
  rarity: 'holo_rare',
  image_url: 'https://example.com/card.png',
  holo_type: 'standard',
  artwork_bounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

describe('HoloCard', () => {
  it('renders canvas overlay for holo card', () => {
    const { container } = render(
      <HoloCard card={holoCard} holoSeed={{ x: 0.3, y: 0.7 }} />
    )
    expect(container.querySelector('canvas.card__holo-canvas')).not.toBeNull()
  })

  it('still renders canvas for none holo type (shader outputs transparent)', () => {
    const { container } = render(
      <HoloCard card={{ ...holoCard, holo_type: 'none' }} />
    )
    expect(container.querySelector('canvas.card__holo-canvas')).not.toBeNull()
  })

  it('renders card image', () => {
    const { container } = render(<HoloCard card={holoCard} />)
    const img = container.querySelector('img.card__img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('card.png')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
npx vitest run src/components/HoloCard/__tests__/HoloCard.test.tsx
```

Expected: FAIL — canvas not found.

- [ ] **Step 3: Update HoloCard.tsx**

Replace `src/components/HoloCard/HoloCard.tsx` with:

```tsx
import { useRef, useCallback, useState } from 'react'
import type { Card, HoloMode, HoloSeed } from '../../types'
import { useHoloShader } from './useHoloShader'
import './HoloCard.css'

type Props = {
  card: Card
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  holoSeed?: HoloSeed
}

const CANVAS_SIZES = {
  sm: { width: 120, height: 167 },
  md: { width: 200, height: 279 },
  lg: { width: 300, height: 418 },
}

function deriveHoloMode(card: Card): HoloMode {
  if (card.holo_type === 'reverse') return 'reverse_holo'
  if (card.holo_type === 'none') return 'none'
  return 'full_holo'
}

export default function HoloCard({
  card,
  size = 'md',
  interactive = true,
  holoSeed,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 })

  const canvasDims = CANVAS_SIZES[size]
  const seed: HoloSeed = holoSeed ?? { x: 0.5, y: 0.5 }
  const artworkBounds = card.artwork_bounds ?? null
  const holoMode = deriveHoloMode(card)

  useHoloShader(canvasRef, {
    seedOffset: seed,
    artworkBounds,
    holoMode,
    holoType: card.holo_type,
    pointer,
  })

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const rotateX = ((y - cy) / cy) * -12
    const rotateY = ((x - cx) / cx) * 12
    const bgX = (x / rect.width) * 100
    const bgY = (y / rect.height) * 100
    const mx = (x / rect.width) * 100
    const my = (y / rect.height) * 100
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    const maxDist = Math.sqrt(cx ** 2 + cy ** 2)
    const pfc = dist / maxDist

    el.style.setProperty('--rotateX', `${rotateX}deg`)
    el.style.setProperty('--rotateY', `${rotateY}deg`)
    el.style.setProperty('--bgX', `${bgX}%`)
    el.style.setProperty('--bgY', `${bgY}%`)
    el.style.setProperty('--mx', `${mx}%`)
    el.style.setProperty('--my', `${my}%`)
    el.style.setProperty('--pointer-from-center', `${pfc}`)

    setPointer({ x: x / rect.width, y: y / rect.height })
  }, [interactive])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return
    const touch = e.touches[0]
    const el = cardRef.current
    if (!el || !touch) return
    const rect = el.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const rotateX = ((y - cy) / cy) * -12
    const rotateY = ((x - cx) / cx) * 12
    const bgX = (x / rect.width) * 100
    const bgY = (y / rect.height) * 100
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    const maxDist = Math.sqrt(cx ** 2 + cy ** 2)
    const pfc = dist / maxDist

    el.style.setProperty('--rotateX', `${rotateX}deg`)
    el.style.setProperty('--rotateY', `${rotateY}deg`)
    el.style.setProperty('--bgX', `${bgX}%`)
    el.style.setProperty('--bgY', `${bgY}%`)
    el.style.setProperty('--mx', `${bgX}%`)
    el.style.setProperty('--my', `${bgY}%`)
    el.style.setProperty('--pointer-from-center', `${pfc}`)

    setPointer({ x: x / rect.width, y: y / rect.height })
  }, [interactive])

  const handleLeave = useCallback(() => {
    const el = cardRef.current
    if (!el) return
    el.style.setProperty('--rotateX', '0deg')
    el.style.setProperty('--rotateY', '0deg')
    el.style.setProperty('--bgX', '50%')
    el.style.setProperty('--bgY', '50%')
    el.style.setProperty('--mx', '50%')
    el.style.setProperty('--my', '50%')
    el.style.setProperty('--pointer-from-center', '0')
    setPointer({ x: 0.5, y: 0.5 })
  }, [])

  return (
    <div
      ref={cardRef}
      className={`card card--${size}`}
      data-holo-type={card.holo_type}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleLeave}
      style={{
        '--rotateX': '0deg',
        '--rotateY': '0deg',
        '--bgX': '50%',
        '--bgY': '50%',
        '--mx': '50%',
        '--my': '50%',
        '--pointer-from-center': '0',
      } as React.CSSProperties}
    >
      <div className="card__translucent" />
      <img className="card__img" src={card.image_url} alt={card.name} loading="lazy" />
      <div className="card__holo" />
      <div className="card__sparkle" />
      <div className="card__glare" />
      <canvas
        ref={canvasRef}
        className="card__holo-canvas"
        width={canvasDims.width}
        height={canvasDims.height}
      />
    </div>
  )
}
```

- [ ] **Step 4: Add canvas CSS to HoloCard.css**

Append to `src/components/HoloCard/HoloCard.css`:

```css
/* WebGL cosmo foil canvas — full card coverage, composited via color-dodge */
.card__holo-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
  z-index: 5;
  mix-blend-mode: color-dodge;
}
```

- [ ] **Step 5: Run test — verify it passes**

```
npx vitest run src/components/HoloCard/__tests__/HoloCard.test.tsx
```

Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/HoloCard/HoloCard.tsx src/components/HoloCard/HoloCard.css src/components/HoloCard/__tests__/HoloCard.test.tsx
git commit -m "feat: integrate WebGL cosmo foil canvas into HoloCard component"
```

---

## Task 9: Pass holoSeed from Collection Route

**Files:**
- Modify: `src/routes/Collection.tsx`

- [ ] **Step 1: Read Collection.tsx to find HoloCard usage**

Open `src/routes/Collection.tsx` and find every `<HoloCard` usage. There will be at least one in the modal and possibly one in the grid.

- [ ] **Step 2: Pass holoSeed prop to each HoloCard**

For the modal's large HoloCard (where `selectedCard` is a `CollectionEntry`):

```tsx
// BEFORE:
<HoloCard card={selectedCard.card} size="lg" interactive={true} />

// AFTER:
<HoloCard
  card={selectedCard.card}
  size="lg"
  interactive={true}
  holoSeed={selectedCard.holo_seed ?? undefined}
/>
```

For any grid thumbnail HoloCard (where the entry is a `CollectionEntry`):

```tsx
// BEFORE:
<HoloCard card={entry.card} size="sm" interactive={false} />

// AFTER:
<HoloCard
  card={entry.card}
  size="sm"
  interactive={false}
  holoSeed={entry.holo_seed ?? undefined}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Collection.tsx
git commit -m "feat: pass holo_seed from collection entries to HoloCard"
```

---

## Task 10: Run process-holo-masks on existing cards

This task is operational, not a code change.

- [ ] **Step 1: Ensure migration is applied and seed-cards has been re-run (or existing cards have card_layout_type set)**

If cards in the DB were seeded before Task 3, their `card_layout_type` will be the default `'standard'`. That's acceptable for now — the bounds will use the standard template. Re-running `seed-cards.ts` would insert duplicates (blocked by unique constraint), so just proceed with defaults.

- [ ] **Step 2: Run the mask script**

```
npx tsx scripts/process-holo-masks.ts
```

Expected: prints one line per card updated with its bounds, then `Done.`

- [ ] **Step 3: Verify in Supabase dashboard**

Check `cards` table — `artwork_bounds` column should be populated on all rows.

- [ ] **Step 4: Smoke test in browser**

Start dev server:
```
npm run dev
```

Open a pack or view collection. Hover over a holo card. The cosmo foil pattern should appear over the artwork area (full holo) or the card border (reverse holo), animated, shifting with mouse movement. The pattern position should differ between two copies of the same card if they have different `holo_seed` values.

- [ ] **Step 5: Final commit**

```bash
git commit --allow-empty -m "ops: populate artwork_bounds for all existing cards via process-holo-masks"
```

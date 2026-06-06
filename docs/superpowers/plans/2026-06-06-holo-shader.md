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

  uniform vec2  u_resolution;
  uniform vec2  u_seed_offset;
  uniform vec2  u_pointer;
  uniform float u_time;
  uniform int   u_holo_mode;
  uniform vec4  u_artwork_bounds;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),              hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

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

    vec2 seeded = uv + u_seed_offset;

    vec2 warped = seeded + vec2(
      fbm(seeded * 3.0 + u_time * 0.12),
      fbm(seeded * 3.0 + vec2(5.2, 1.3) + u_time * 0.12)
    ) * 0.4;

    float angle = atan(warped.y - 0.5, warped.x - 0.5);
    float hue = mod(angle / 6.2832 + u_time * 0.04 + u_pointer.x * 0.25, 1.0);

    float dist = length(u_pointer - vec2(0.5));
    float alpha = 0.35 + dist * 0.35;

    vec3 color = hsl2rgb(hue, 1.0, 0.55);
    gl_FragColor = vec4(color, alpha);
  }
`
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/HoloCard/shaders.ts
git commit -m "feat: add cosmo foil GLSL vertex and fragment shaders"
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
import type { ArtworkBounds, HoloMode, HoloSeed } from '../../types'

interface HoloShaderOpts {
  seedOffset: HoloSeed
  artworkBounds: ArtworkBounds | null
  holoMode: HoloMode
  pointer: { x: number; y: number }
}

type UniformLocations = {
  u_resolution: WebGLUniformLocation | null
  u_seed_offset: WebGLUniformLocation | null
  u_pointer: WebGLUniformLocation | null
  u_time: WebGLUniformLocation | null
  u_holo_mode: WebGLUniformLocation | null
  u_artwork_bounds: WebGLUniformLocation | null
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
    u_resolution:    gl.getUniformLocation(program, 'u_resolution'),
    u_seed_offset:   gl.getUniformLocation(program, 'u_seed_offset'),
    u_pointer:       gl.getUniformLocation(program, 'u_pointer'),
    u_time:          gl.getUniformLocation(program, 'u_time'),
    u_holo_mode:     gl.getUniformLocation(program, 'u_holo_mode'),
    u_artwork_bounds: gl.getUniformLocation(program, 'u_artwork_bounds'),
  }

  return { gl, program, uniforms }
}

const HOLO_MODE_INT: Record<HoloMode, number> = {
  none: 0,
  full_holo: 1,
  reverse_holo: 2,
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
      const { seedOffset, artworkBounds, holoMode, pointer } = optsRef.current
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

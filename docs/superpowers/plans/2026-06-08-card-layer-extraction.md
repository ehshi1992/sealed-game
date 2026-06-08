# Card Layer Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript script that calls the remove.bg API to split card images into subject and background PNGs, uploads them to Supabase Storage, and writes the URLs back to the `cards` table for use by the holo shader.

**Architecture:** The script (`scripts/process-card-layers.ts`) fetches card records from Supabase, calls remove.bg with each card's `image_url`, composites two PNGs using `sharp` (subject = original pixels with remove.bg alpha; bg = original pixels with inverted alpha), uploads both to the `card-layers` Storage bucket, then updates the DB. A Supabase migration adds `subject_layer_url` and `bg_layer_url` columns to `cards`.

**Tech Stack:** TypeScript, tsx, sharp, @supabase/supabase-js, dotenv, remove.bg REST API

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/008_card_layer_urls.sql` | Create | Add `subject_layer_url` + `bg_layer_url` columns to `cards` |
| `scripts/process-card-layers.ts` | Create | Main script: fetch → remove.bg → composite → upload → DB update |
| `.env.local` | Modify | Add `REMOVE_BG_API_KEY` |
| `scripts/__tests__/process-card-layers.test.ts` | Create | Unit tests for compositing logic and skip logic |

---

### Task 1: DB Migration — add layer URL columns

**Files:**
- Create: `supabase/migrations/008_card_layer_urls.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/008_card_layer_urls.sql
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS subject_layer_url text,
  ADD COLUMN IF NOT EXISTS bg_layer_url text;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output: migration applied with no errors.

- [ ] **Step 3: Verify columns exist**

```bash
npx supabase db diff
```

Expected: no diff (schema matches local migration).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_card_layer_urls.sql
git commit -m "feat: add subject_layer_url and bg_layer_url columns to cards"
```

---

### Task 2: Create Supabase Storage bucket

**Files:** (no code files — Supabase dashboard / CLI)

The `card-layers` bucket must exist before the script can upload. Create it once manually.

- [ ] **Step 1: Create the bucket via Supabase CLI**

```bash
npx supabase storage create card-layers --public
```

If the CLI command isn't available in your version, create via the Supabase dashboard:
- Go to Storage → New bucket
- Name: `card-layers`
- Public: yes (URLs in DB are accessed directly by shader)

- [ ] **Step 2: Verify bucket exists**

```bash
npx supabase storage ls
```

Expected: `card-layers` listed.

---

### Task 3: Add `REMOVE_BG_API_KEY` to env

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add the key to `.env.local`**

Open `.env.local` and append:

```
REMOVE_BG_API_KEY=your_key_here
```

Get an API key from https://www.remove.bg/api — free tier includes 50 previews/month (1000×resolution), paid for full resolution.

- [ ] **Step 2: Verify env loads**

```bash
node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.REMOVE_BG_API_KEY ? 'OK' : 'MISSING')"
```

Expected: `OK`

---

### Task 4: Write unit tests for compositing and skip logic

**Files:**
- Create: `scripts/__tests__/process-card-layers.test.ts`

These test the pure logic functions that will be exported from the script — no actual HTTP calls.

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/__tests__/process-card-layers.test.ts
import { describe, it, expect } from 'vitest'
import { shouldSkipCard, buildStoragePaths } from '../process-card-layers'

describe('shouldSkipCard', () => {
  it('skips trainer cards', () => {
    expect(shouldSkipCard({ card_layout_type: 'trainer', subject_layer_url: null, bg_layer_url: null }, false)).toBe(true)
  })

  it('skips energy cards', () => {
    expect(shouldSkipCard({ card_layout_type: 'energy', subject_layer_url: null, bg_layer_url: null }, false)).toBe(true)
  })

  it('skips already-processed cards without --force', () => {
    expect(shouldSkipCard({ card_layout_type: 'standard', subject_layer_url: 'https://...', bg_layer_url: 'https://...' }, false)).toBe(true)
  })

  it('does not skip already-processed cards with --force', () => {
    expect(shouldSkipCard({ card_layout_type: 'standard', subject_layer_url: 'https://...', bg_layer_url: 'https://...' }, true)).toBe(false)
  })

  it('does not skip unprocessed pokemon cards', () => {
    expect(shouldSkipCard({ card_layout_type: 'standard', subject_layer_url: null, bg_layer_url: null }, false)).toBe(false)
  })

  it('does not skip partially processed cards (only subject set)', () => {
    expect(shouldSkipCard({ card_layout_type: 'standard', subject_layer_url: 'https://...', bg_layer_url: null }, false)).toBe(false)
  })
})

describe('buildStoragePaths', () => {
  it('returns correct paths for a card id', () => {
    const paths = buildStoragePaths('neo1-1')
    expect(paths.subject).toBe('neo1-1/subject.png')
    expect(paths.bg).toBe('neo1-1/bg.png')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- scripts/__tests__/process-card-layers.test.ts
```

Expected: FAIL — `process-card-layers` module not found.

---

### Task 5: Implement `process-card-layers.ts`

**Files:**
- Create: `scripts/process-card-layers.ts`

- [ ] **Step 1: Write the script**

```typescript
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const SKIP_LAYOUT_TYPES = new Set(['trainer', 'energy'])
const REMOVE_BG_URL = 'https://api.remove.bg/v1.0/removebg'
const BUCKET = 'card-layers'

type CardRow = {
  id: string
  image_url: string
  card_layout_type: string
  subject_layer_url: string | null
  bg_layer_url: string | null
}

export type SkipInput = Pick<CardRow, 'card_layout_type' | 'subject_layer_url' | 'bg_layer_url'>

export function shouldSkipCard(card: SkipInput, force: boolean): boolean {
  if (SKIP_LAYOUT_TYPES.has(card.card_layout_type)) return true
  if (!force && card.subject_layer_url !== null && card.bg_layer_url !== null) return true
  return false
}

export function buildStoragePaths(cardId: string): { subject: string; bg: string } {
  return {
    subject: `${cardId}/subject.png`,
    bg: `${cardId}/bg.png`,
  }
}

async function callRemoveBg(imageUrl: string): Promise<{ buffer: Buffer; creditsRemaining: string | null }> {
  const apiKey = process.env.REMOVE_BG_API_KEY
  if (!apiKey) throw new Error('REMOVE_BG_API_KEY not set in .env.local')

  const body = new FormData()
  body.append('image_url', imageUrl)
  body.append('size', 'auto')

  const res = await fetch(REMOVE_BG_URL, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body,
  })

  const creditsRemaining = res.headers.get('X-Credits-Remaining')

  if (res.status === 402) {
    throw new Error(`remove.bg 402 insufficient credits — aborting (credits remaining: ${creditsRemaining})`)
  }
  if (res.status === 429) {
    throw new Error(`remove.bg 429 rate limit — aborting`)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`remove.bg ${res.status}: ${text}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, creditsRemaining }
}

async function compositeSubject(originalUrl: string, removeBgRgba: Buffer): Promise<Buffer> {
  const original = await fetch(originalUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b))
  const { data: alphaData, info } = await sharp(removeBgRgba)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const channels = info.channels // 4 (RGBA)

  const originalRaw = await sharp(original)
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer()

  // subject: original RGB + remove.bg alpha
  const subjectData = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    subjectData[i * 4 + 0] = originalRaw[i * 4 + 0] // R
    subjectData[i * 4 + 1] = originalRaw[i * 4 + 1] // G
    subjectData[i * 4 + 2] = originalRaw[i * 4 + 2] // B
    subjectData[i * 4 + 3] = alphaData[i * channels + 3] // A from remove.bg
  }

  return sharp(subjectData, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}

async function compositeBg(originalUrl: string, removeBgRgba: Buffer): Promise<Buffer> {
  const original = await fetch(originalUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b))
  const { data: alphaData, info } = await sharp(removeBgRgba)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const channels = info.channels

  const originalRaw = await sharp(original)
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer()

  // bg: original RGB + inverted remove.bg alpha
  const bgData = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    bgData[i * 4 + 0] = originalRaw[i * 4 + 0]
    bgData[i * 4 + 1] = originalRaw[i * 4 + 1]
    bgData[i * 4 + 2] = originalRaw[i * 4 + 2]
    bgData[i * 4 + 3] = 255 - alphaData[i * channels + 3] // inverted alpha
  }

  return sharp(bgData, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}

async function uploadToStorage(cardId: string, subjectBuf: Buffer, bgBuf: Buffer): Promise<{ subjectUrl: string; bgUrl: string }> {
  const paths = buildStoragePaths(cardId)

  const { error: subErr } = await supabase.storage
    .from(BUCKET)
    .upload(paths.subject, subjectBuf, { contentType: 'image/png', upsert: true })
  if (subErr) throw new Error(`Storage upload subject failed: ${subErr.message}`)

  const { error: bgErr } = await supabase.storage
    .from(BUCKET)
    .upload(paths.bg, bgBuf, { contentType: 'image/png', upsert: true })
  if (bgErr) throw new Error(`Storage upload bg failed: ${bgErr.message}`)

  const { data: { publicUrl: subjectUrl } } = supabase.storage.from(BUCKET).getPublicUrl(paths.subject)
  const { data: { publicUrl: bgUrl } } = supabase.storage.from(BUCKET).getPublicUrl(paths.bg)

  return { subjectUrl, bgUrl }
}

async function processCard(card: CardRow, force: boolean): Promise<'skipped' | 'processed' | 'error'> {
  const skipReason = SKIP_LAYOUT_TYPES.has(card.card_layout_type)
    ? card.card_layout_type
    : !force && card.subject_layer_url && card.bg_layer_url
      ? 'already processed, use --force to re-run'
      : null

  if (skipReason) {
    console.log(`[${card.id}] skip (${skipReason})`)
    return 'skipped'
  }

  console.log(`[${card.id}] processing...`)

  let removeBgRgba: Buffer
  try {
    const { buffer, creditsRemaining } = await callRemoveBg(card.image_url)
    removeBgRgba = buffer
    if (creditsRemaining !== null) process.stdout.write(` (credits remaining: ${creditsRemaining})`)
    process.stdout.write('\n')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isFatal = msg.includes('402') || msg.includes('429')
    console.error(`[${card.id}] error: ${msg}`)
    if (isFatal) throw err // re-throw to abort remaining cards
    return 'error'
  }

  let subjectBuf: Buffer
  let bgBuf: Buffer
  try {
    ;[subjectBuf, bgBuf] = await Promise.all([
      compositeSubject(card.image_url, removeBgRgba),
      compositeBg(card.image_url, removeBgRgba),
    ])
  } catch (err: unknown) {
    console.error(`[${card.id}] composite error: ${err instanceof Error ? err.message : String(err)}`)
    return 'error'
  }

  let subjectUrl: string
  let bgUrl: string
  try {
    ;({ subjectUrl, bgUrl } = await uploadToStorage(card.id, subjectBuf, bgBuf))
  } catch (err: unknown) {
    console.error(`[${card.id}] upload error: ${err instanceof Error ? err.message : String(err)}`)
    return 'error'
  }

  const { error: dbErr } = await supabase
    .from('cards')
    .update({ subject_layer_url: subjectUrl, bg_layer_url: bgUrl })
    .eq('id', card.id)

  if (dbErr) {
    console.error(`[${card.id}] db update error: ${dbErr.message}`)
    return 'error'
  }

  console.log(`[${card.id}] done (credits remaining shown above)`)
  return 'processed'
}

async function fetchCardsByIds(ids: string[]): Promise<CardRow[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('id, image_url, card_layout_type, subject_layer_url, bg_layer_url')
    .in('id', ids)
  if (error) throw error
  return data as CardRow[]
}

async function fetchCardsBySet(setId: string): Promise<CardRow[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('id, image_url, card_layout_type, subject_layer_url, bg_layer_url')
    .eq('set', setId)
  if (error) throw error
  return data as CardRow[]
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const setIdx = args.indexOf('--set')
  const setId = setIdx !== -1 ? args[setIdx + 1] : null
  const cardIds = args.filter(a => !a.startsWith('--') && a !== setId)

  if (!setId && cardIds.length === 0) {
    console.error('Usage: npx tsx scripts/process-card-layers.ts [card_id...] [--set <set_id>] [--force]')
    process.exit(1)
  }
  if (setId && cardIds.length > 0) {
    console.error('Provide either card IDs or --set, not both')
    process.exit(1)
  }

  const cards = setId ? await fetchCardsBySet(setId) : await fetchCardsByIds(cardIds)
  console.log(`Found ${cards.length} cards to consider`)

  let processed = 0
  let skipped = 0
  let errors = 0

  for (const card of cards) {
    try {
      const result = await processCard(card, force)
      if (result === 'processed') processed++
      else if (result === 'skipped') skipped++
      else errors++
    } catch {
      // fatal error (402/429) — abort
      break
    }
  }

  console.log(`\nDone — processed: ${processed}, skipped: ${skipped}, errors: ${errors}`)
}

main()
```

- [ ] **Step 2: Install `sharp` if not already present**

```bash
npm install sharp
npm install --save-dev @types/sharp
```

Expected: `sharp` appears in `package.json` dependencies.

- [ ] **Step 3: Run unit tests — they should now pass**

```bash
npm run test -- scripts/__tests__/process-card-layers.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/process-card-layers.ts scripts/__tests__/process-card-layers.test.ts package.json package-lock.json
git commit -m "feat: process-card-layers script — remove.bg subject/bg split"
```

---

### Task 6: Smoke test on a single card

- [ ] **Step 1: Run against one known Pokémon card**

Pick a Neo Genesis Pokémon card ID (e.g. `neo1-1` is Chikorita). Run:

```bash
npx tsx scripts/process-card-layers.ts neo1-1
```

Expected log:
```
Found 1 cards to consider
[neo1-1] processing...
[neo1-1] done
Done — processed: 1, skipped: 0, errors: 0
```

- [ ] **Step 2: Verify DB updated**

```bash
node -e "
const {createClient} = require('@supabase/supabase-js');
require('dotenv').config({path:'.env.local'});
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('cards').select('id,subject_layer_url,bg_layer_url').eq('id','neo1-1').single().then(({data}) => console.log(data));
"
```

Expected: `subject_layer_url` and `bg_layer_url` are non-null Supabase Storage public URLs.

- [ ] **Step 3: Verify images in browser**

Open both URLs from Step 2 in a browser. `subject.png` should show the Pokémon with transparent background. `bg.png` should show the background with transparent subject area.

- [ ] **Step 4: Test skip behavior**

Re-run without `--force`:

```bash
npx tsx scripts/process-card-layers.ts neo1-1
```

Expected:
```
[neo1-1] skip (already processed, use --force to re-run)
Done — processed: 0, skipped: 1, errors: 0
```

- [ ] **Step 5: Test `--force` re-processes**

```bash
npx tsx scripts/process-card-layers.ts neo1-1 --force
```

Expected: `[neo1-1] processing...` → `done`.

- [ ] **Step 6: Test trainer skip**

Find a trainer card ID in neo1 (e.g. `neo1-96` is Bill's Teleporter). Run:

```bash
npx tsx scripts/process-card-layers.ts neo1-96
```

Expected:
```
[neo1-96] skip (trainer)
Done — processed: 0, skipped: 1, errors: 0
```

- [ ] **Step 7: Commit smoke test results (none — no code change)**

No commit needed. Proceed to Task 7 once images look correct in browser.

---

### Task 7: Bulk process a full set

Only run after Task 6 passes visual inspection.

- [ ] **Step 1: Dry-run count**

```bash
npx tsx scripts/process-card-layers.ts --set neo1 2>&1 | head -5
```

Expected: `Found N cards to consider` — note the count. Verify it's reasonable (Neo Genesis has 111 cards; trainers/energy will be skipped).

- [ ] **Step 2: Run bulk process**

```bash
npx tsx scripts/process-card-layers.ts --set neo1
```

Monitor output for errors. Each processed card logs `done`. Fatal errors (402/429) abort and log clearly.

- [ ] **Step 3: Verify count in DB**

```bash
node -e "
const {createClient} = require('@supabase/supabase-js');
require('dotenv').config({path:'.env.local'});
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('cards').select('id', {count:'exact'}).eq('set','neo1').not('subject_layer_url','is',null).then(({count}) => console.log('processed:', count));
"
```

- [ ] **Step 4: No commit needed** — DB and Storage are updated; script was already committed in Task 5.

---

## Self-Review Against Spec

| Spec requirement | Task |
|-----------------|------|
| Skip trainer + energy via `card_layout_type` | Task 5 (shouldSkipCard) |
| Skip already-processed without `--force` | Task 5 (shouldSkipCard) |
| `--force` re-processes | Task 5 (main args), Task 6 |
| Positional card IDs | Task 5 (main args) |
| `--set <set_id>` | Task 5 (main args) |
| Mutex: card IDs OR --set, not both | Task 5 (main args) |
| remove.bg `image_url` input | Task 5 (callRemoveBg) |
| RGBA PNG → subject composite | Task 5 (compositeSubject) |
| RGBA PNG → bg composite (inverted alpha) | Task 5 (compositeBg) |
| Upload to `card-layers/{id}/subject.png` + `bg.png` | Task 5 (uploadToStorage, buildStoragePaths) |
| Update `subject_layer_url` + `bg_layer_url` | Task 5 (processCard) |
| 402/429 → abort remaining | Task 5 (processCard fatal re-throw) |
| Upload failure → skip DB update (safe retry) | Task 5 (error handling) |
| Log credits remaining | Task 5 (callRemoveBg logs res header note — **gap**: header logged on error only) |
| DB migration with new columns | Task 1 |
| Storage bucket creation | Task 2 |
| Env var `REMOVE_BG_API_KEY` | Task 3 |

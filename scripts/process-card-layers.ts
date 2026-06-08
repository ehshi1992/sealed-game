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

async function compositeSubject(originalBuf: Buffer, removeBgRgba: Buffer): Promise<Buffer> {
  const { data: alphaData, info } = await sharp(removeBgRgba)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const channels = info.channels

  const originalRaw = await sharp(originalBuf)
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer()

  const subjectData = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    subjectData[i * 4 + 0] = originalRaw[i * 4 + 0]
    subjectData[i * 4 + 1] = originalRaw[i * 4 + 1]
    subjectData[i * 4 + 2] = originalRaw[i * 4 + 2]
    subjectData[i * 4 + 3] = alphaData[i * channels + 3]
  }

  return sharp(subjectData, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}

async function compositeBg(originalBuf: Buffer, removeBgRgba: Buffer): Promise<Buffer> {
  const { data: alphaData, info } = await sharp(removeBgRgba)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const channels = info.channels

  const originalRaw = await sharp(originalBuf)
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer()

  const bgData = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    bgData[i * 4 + 0] = originalRaw[i * 4 + 0]
    bgData[i * 4 + 1] = originalRaw[i * 4 + 1]
    bgData[i * 4 + 2] = originalRaw[i * 4 + 2]
    bgData[i * 4 + 3] = 255 - alphaData[i * channels + 3]
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
  if (shouldSkipCard(card, force)) {
    const reason = SKIP_LAYOUT_TYPES.has(card.card_layout_type)
      ? card.card_layout_type
      : 'already processed, use --force to re-run'
    console.log(`[${card.id}] skip (${reason})`)
    return 'skipped'
  }

  process.stdout.write(`[${card.id}] processing...`)

  let removeBgRgba: Buffer
  try {
    const { buffer, creditsRemaining } = await callRemoveBg(card.image_url)
    removeBgRgba = buffer
    if (creditsRemaining !== null) process.stdout.write(` (credits remaining: ${creditsRemaining})`)
    process.stdout.write('\n')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isFatal = msg.includes('402') || msg.includes('429')
    console.error(`\n[${card.id}] error: ${msg}`)
    if (isFatal) throw err
    return 'error'
  }

  let originalBuf: Buffer
  let subjectBuf: Buffer
  let bgBuf: Buffer
  try {
    originalBuf = Buffer.from(await fetch(card.image_url).then(r => r.arrayBuffer()))
    ;[subjectBuf, bgBuf] = await Promise.all([
      compositeSubject(originalBuf, removeBgRgba),
      compositeBg(originalBuf, removeBgRgba),
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

  console.log(`[${card.id}] done`)
  return 'processed'
}

async function fetchCardsByIds(cardKeys: string[]): Promise<CardRow[]> {
  const results: CardRow[] = []
  for (const key of cardKeys) {
    const dashIdx = key.indexOf('-')
    if (dashIdx === -1) throw new Error(`Invalid card key "${key}" — expected "{set}-{number}" e.g. neo1-1`)
    const set = key.slice(0, dashIdx)
    const number = key.slice(dashIdx + 1)
    const { data, error } = await supabase
      .from('cards')
      .select('id, image_url, card_layout_type, subject_layer_url, bg_layer_url')
      .eq('set', set)
      .eq('number', number)
      .single()
    if (error) throw new Error(`DB fetch failed for ${key}: ${error.message}`)
    results.push(data as CardRow)
  }
  return results
}

async function fetchCardsBySet(setId: string): Promise<CardRow[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('id, image_url, card_layout_type, subject_layer_url, bg_layer_url')
    .eq('set', setId)
  if (error) throw new Error(`DB fetch failed: ${error.message}`)
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
      break
    }
  }

  console.log(`\nDone — processed: ${processed}, skipped: ${skipped}, errors: ${errors}`)
}

// Only run when executed directly (not imported in tests)
if (process.env.VITEST !== 'true') {
  main().catch(err => {
    console.error('Fatal:', err?.message ?? err)
    process.exit(1)
  })
}

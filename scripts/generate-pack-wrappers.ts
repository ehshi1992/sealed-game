// Generate booster-pack WRAPPER textures by compositing each set logo onto a
// foil wrapper background (so the 3D pack reads as a pack, not a bare logo).
//
//   npx tsx scripts/generate-pack-wrappers.ts            # write samples to output/pack-wrappers/
//   npx tsx scripts/generate-pack-wrappers.ts --only "Neo Genesis"
//   npx tsx scripts/generate-pack-wrappers.ts --apply    # also upload + update packs.image_url
//
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Pack plane aspect is PACK_W/PACK_H = 2.2/3.2 = 0.6875 → portrait wrapper.
const W = 660
const H = 960
const BUCKET = 'pack-images'
const OUT_DIR = 'output/pack-wrappers'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ONLY = (() => {
  const i = args.indexOf('--only')
  return i >= 0 ? args[i + 1]?.toLowerCase() : null
})()

function clamp(n: number) { return Math.max(0, Math.min(255, Math.round(n))) }
function mix(a: number, b: number, t: number) { return a + (b - a) * t }
function hex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}

// Build the foil wrapper background as an SVG (gradient + diagonal streaks +
// crimped top/bottom seal bands + vignette). `acc` is the per-pack accent.
function wrapperSvg(acc: { r: number; g: number; b: number }): string {
  const dark   = hex(mix(acc.r, 0, 0.78), mix(acc.g, 0, 0.78), mix(acc.b, 0, 0.78))
  const mid    = hex(mix(acc.r, 0, 0.35), mix(acc.g, 0, 0.35), mix(acc.b, 0, 0.35))
  const light  = hex(mix(acc.r, 255, 0.18), mix(acc.g, 255, 0.18), mix(acc.b, 255, 0.18))
  const crimpH = Math.round(H * 0.055)

  // crimp seal = alternating vertical light/dark teeth
  const teeth: string[] = []
  const tw = 14
  for (let x = 0; x < W; x += tw) {
    const c = (x / tw) % 2 === 0 ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)'
    teeth.push(`<rect x="${x}" y="0" width="${tw}" height="${crimpH}" fill="${c}"/>`)
    teeth.push(`<rect x="${x}" y="${H - crimpH}" width="${tw}" height="${crimpH}" fill="${c}"/>`)
  }

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="${dark}"/>
        <stop offset="42%" stop-color="${mid}"/>
        <stop offset="58%" stop-color="${mid}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </linearGradient>
      <linearGradient id="streak" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="${light}" stop-opacity="0"/>
        <stop offset="50%"  stop-color="${light}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${light}" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="vig" cx="50%" cy="42%" r="75%">
        <stop offset="55%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <g transform="rotate(-22 ${W / 2} ${H / 2})">
      <rect x="-${W}" y="${H * 0.16}" width="${W * 3}" height="120" fill="url(#streak)"/>
      <rect x="-${W}" y="${H * 0.52}" width="${W * 3}" height="80"  fill="url(#streak)" opacity="0.7"/>
      <rect x="-${W}" y="${H * 0.78}" width="${W * 3}" height="60"  fill="url(#streak)" opacity="0.5"/>
    </g>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
    ${teeth.join('')}
    <rect x="0" y="${crimpH}" width="${W}" height="2" fill="rgba(0,0,0,0.6)"/>
    <rect x="0" y="${H - crimpH - 2}" width="${W}" height="2" fill="rgba(0,0,0,0.6)"/>
  </svg>`
}

async function buildWrapper(logo: Buffer): Promise<Buffer> {
  // Accent = dominant colour of the logo.
  const { dominant } = await sharp(logo).stats()
  const acc = dominant

  const bg = await sharp(Buffer.from(wrapperSvg(acc))).png().toBuffer()

  // Logo: fit within ~74% width, centred slightly above middle.
  const logoW = Math.round(W * 0.74)
  const resized = await sharp(logo)
    .resize({ width: logoW, fit: 'inside', withoutEnlargement: false })
    .toBuffer()
  const meta = await sharp(resized).metadata()
  const top = Math.round(H * 0.40 - (meta.height ?? 0) / 2)
  const left = Math.round((W - (meta.width ?? logoW)) / 2)

  return sharp(bg)
    .composite([{ input: resized, top, left }])
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const { data: packs, error } = await supabase
    .from('packs')
    .select('id, name, image_url')
  if (error) { console.error(error); process.exit(1) }

  for (const pack of packs ?? []) {
    if (ONLY && !pack.name.toLowerCase().includes(ONLY)) continue
    if (!pack.image_url) { console.log(`skip ${pack.name}: no image_url`); continue }

    const res = await fetch(pack.image_url)
    if (!res.ok) { console.error(`fetch failed ${pack.name}: ${res.status}`); continue }
    const logo = Buffer.from(await res.arrayBuffer())

    const out = await buildWrapper(logo)
    const file = `${OUT_DIR}/${pack.id}.png`
    await writeFile(file, out)
    console.log(`wrote ${file}  (${pack.name})`)

    if (APPLY) {
      const path = `wrapper-${pack.id}.png`
      const up = await supabase.storage.from(BUCKET).upload(path, out, {
        contentType: 'image/png', upsert: true,
      })
      if (up.error) { console.error(`upload failed ${pack.name}:`, up.error); continue }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const upd = await supabase.from('packs').update({ image_url: pub.publicUrl }).eq('id', pack.id)
      if (upd.error) { console.error(`db update failed ${pack.name}:`, upd.error); continue }
      console.log(`  applied -> ${pub.publicUrl}`)
    }
  }
}

main()

// One-off: re-host pack images in Supabase Storage so they can be used as
// WebGL textures (images.pokemontcg.io sends no CORS headers, which breaks
// useTexture() in the 3D pack-tear scene).
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET = 'pack-images'

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) { console.error(error); process.exit(1) }
  if (buckets?.some((b) => b.name === BUCKET)) return

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
  })
  if (createError) { console.error(createError); process.exit(1) }
  console.log(`Created bucket "${BUCKET}"`)
}

async function main() {
  await ensureBucket()

  const { data: packs, error } = await supabase
    .from('packs')
    .select('id, name, image_url')

  if (error) { console.error(error); process.exit(1) }

  for (const pack of packs ?? []) {
    if (!pack.image_url || !pack.image_url.includes('images.pokemontcg.io')) {
      console.log(`Skip ${pack.name}: already migrated (${pack.image_url})`)
      continue
    }

    const res = await fetch(pack.image_url)
    if (!res.ok) {
      console.error(`Failed to fetch ${pack.image_url}: ${res.status}`)
      continue
    }
    const buf = new Uint8Array(await res.arrayBuffer())
    const path = `${pack.id}.png`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: 'image/png', upsert: true })

    if (uploadError) {
      console.error(`Upload failed for ${pack.name}:`, uploadError)
      continue
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

    const { error: updateError } = await supabase
      .from('packs')
      .update({ image_url: pub.publicUrl })
      .eq('id', pack.id)

    if (updateError) {
      console.error(`DB update failed for ${pack.name}:`, updateError)
      continue
    }

    console.log(`Migrated ${pack.name} -> ${pub.publicUrl}`)
  }
}

main()

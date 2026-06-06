import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role key — NOT the anon key
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

async function fetchCards(setId: string) {
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250`,
    { headers: { 'X-Api-Key': process.env.POKEMONTCG_API_KEY! } }
  )
  const json = await res.json()
  return json.data as Array<{
    id: string
    name: string
    set: { id: string }
    number: string
    rarity?: string
    images: { large: string }
  }>
}

async function seed() {
  // Seed Base Set (base1) as the first pack
  const setId = 'base1'
  const raw = await fetchCards(setId)

  const cards = raw.map((c) => {
    const rarity = RARITY_MAP[c.rarity ?? ''] ?? 'common'
    return {
      name: c.name,
      set: c.set.id,
      number: c.number,
      rarity,
      image_url: c.images.large,
      holo_type: HOLO_MAP[rarity] ?? 'none',
    }
  })

  console.log(`Inserting ${cards.length} cards from set ${setId}…`)

  const { data: insertedCards, error: cardError } = await supabase
    .from('cards')
    .upsert(cards, { onConflict: 'name,set,number' })
    .select('id')

  if (cardError) { console.error(cardError); process.exit(1) }

  const cardIds = insertedCards!.map((c: { id: string }) => c.id)

  // Create a Base Set pack
  const { error: packError } = await supabase
    .from('packs')
    .upsert({
      name: 'Base Set Booster',
      price: 100,
      image_url: 'https://images.pokemontcg.io/base1/logo.png',
      card_pool: cardIds,
    }, { onConflict: 'name' })

  if (packError) { console.error(packError); process.exit(1) }

  console.log('Seed complete.')
}

seed()

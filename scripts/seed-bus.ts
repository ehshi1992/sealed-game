import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function seed() {
  const card = {
    name: 'Bus',
    set: 'custom1',
    set_name: 'Custom',
    set_code: 'custom1',
    number: '1',
    rarity: 'secret_rare',
    holo_type: 'rainbow',
    card_layout_type: 'standard',
    supertype: 'Pokémon',
    subtypes: [],
    hp: 90,
    types: ['Fighting'],
    artist: 'Ken Sugimori',
    flavor_text: 'Has a powerful, albeit unusual, swing. Found near golf courses on misty days.',
    national_pokedex_numbers: [152],
    image_url: '/cards/bus.png',
    rarity_raw: 'Rare Secret',
  }

  const { data: inserted, error: cardError } = await supabase
    .from('cards')
    .upsert(card, { onConflict: 'set,number' })
    .select('id')
    .single()

  if (cardError) { console.error('Card insert failed:', cardError); process.exit(1) }
  console.log('Card inserted:', inserted.id)

  const { data: existing } = await supabase
    .from('packs')
    .select('id')
    .eq('name', 'Bus Pack')
    .maybeSingle()

  if (existing) {
    console.log('Pack already exists, skipping.')
    return
  }

  const { error: packError } = await supabase
    .from('packs')
    .insert({
      name: 'Bus Pack',
      price: 100,
      image_url: '/cards/bus.png',
      card_pool: [inserted.id],
    })

  if (packError) { console.error('Pack insert failed:', packError); process.exit(1) }
  console.log('Done: Bus Pack')
}

seed()

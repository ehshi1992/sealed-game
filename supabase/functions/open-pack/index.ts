import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Card = { id: string; rarity: string }

function rollRarity(rand: number): string {
  if (rand < 0.60) return 'common'
  if (rand < 0.85) return 'uncommon'
  if (rand < 0.95) return 'rare'
  if (rand < 0.99) return 'holo_rare'
  return 'ultra_rare'
}

function buildPack(cardPool: Card[], cardCount: number): string[] {
  if (cardCount <= 0) return []
  const rand = () => Math.random()
  const byRarity = (r: string) => cardPool.filter(c => c.rarity === r)
  const pick = (pool: Card[]) => pool[Math.floor(rand() * pool.length)]?.id

  // Single-card packs: just pick one card, no rarity structure
  if (cardCount === 1) {
    const id = pick(cardPool)
    return id ? [id] : []
  }

  const cards: string[] = []
  const rarePool = cardPool.filter(c =>
    ['rare', 'holo_rare', 'ultra_rare', 'secret_rare'].includes(c.rarity)
  )
  const guaranteed = pick(rarePool.length > 0 ? rarePool : cardPool)
  if (guaranteed) cards.push(guaranteed)

  for (let i = 1; i < cardCount; i++) {
    const rarity = rollRarity(rand())
    const pool = byRarity(rarity).length > 0 ? byRarity(rarity) : cardPool
    const card = pick(pool)
    if (card) cards.push(card)
  }

  return cards
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://gcwqxxnaccxjmrndowbu.supabase.co'
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    console.log('SUPABASE_URL:', supabaseUrl)
    console.log('SERVICE_ROLE_KEY prefix:', serviceKey?.slice(0, 20))

    // User client (respects RLS for reads)
    const userClient = createClient(
      supabaseUrl,
      anonKey,
      { global: { headers: { authorization: authHeader } } }
    )

    // Service client (bypasses RLS for writes)
    const serviceClient = createClient(supabaseUrl, serviceKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: userError?.message }), { status: 401, headers: corsHeaders })
    }

    const { packId } = await req.json() as { packId: string }

    // Fetch pack + price
    const { data: pack, error: packError } = await userClient
      .from('packs')
      .select('id, price, card_pool, card_count')
      .eq('id', packId)
      .single()

    if (packError || !pack) {
      return new Response(JSON.stringify({ error: 'Pack not found' }), { status: 404, headers: corsHeaders })
    }

    // Fetch current currency and check balance
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('currency')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: corsHeaders })
    }

    if (profile.currency < pack.price) {
      return new Response(JSON.stringify({ error: 'Insufficient currency' }), { status: 402, headers: corsHeaders })
    }

    // Deduct currency
    const { data: newCurrency, error: deductError } = await serviceClient
      .rpc('increment_currency', { uid: user.id, delta: -pack.price })

    if (deductError || newCurrency === null) {
      return new Response(JSON.stringify({ error: 'Failed to deduct currency' }), { status: 500, headers: corsHeaders })
    }

    // Fetch cards in this pack's pool
    const { data: poolCards, error: poolError } = await serviceClient
      .from('cards')
      .select('id, rarity')
      .in('id', pack.card_pool)

    if (poolError || !poolCards || poolCards.length === 0) {
      return new Response(JSON.stringify({ error: 'Empty card pool' }), { status: 500, headers: corsHeaders })
    }

    const selectedIds = buildPack(poolCards as Card[], pack.card_count ?? 10)

    // Insert into user_collection
    const collectionRows = selectedIds.map(cardId => ({
      user_id: user.id,
      card_id: cardId,
      holo_seed: { x: Math.random(), y: Math.random() },
    }))

    const { error: insertError } = await serviceClient.from('user_collection').insert(collectionRows)
    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to add cards to collection' }), { status: 500, headers: corsHeaders })
    }

    // Record transaction
    await serviceClient.from('transactions').insert({
      user_id: user.id,
      type: 'pack_purchase',
      amount: -pack.price,
    })

    // Fetch full card data to return
    const { data: cards } = await serviceClient
      .from('cards')
      .select('*')
      .in('id', selectedIds)

    return new Response(
      JSON.stringify({ cards, newCurrency }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})

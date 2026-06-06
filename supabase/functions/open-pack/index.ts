import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

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

function buildPack(cardPool: Card[]): string[] {
  const rand = () => Math.random()
  const byRarity = (r: string) => cardPool.filter(c => c.rarity === r)
  const pick = (pool: Card[]) => pool[Math.floor(rand() * pool.length)]?.id

  const cards: string[] = []
  const rarePool = cardPool.filter(c =>
    ['rare', 'holo_rare', 'ultra_rare', 'secret_rare'].includes(c.rarity)
  )
  const guaranteed = pick(rarePool.length > 0 ? rarePool : cardPool)
  if (guaranteed) cards.push(guaranteed)

  for (let i = 1; i < 10; i++) {
    const rarity = rollRarity(rand())
    const pool = byRarity(rarity).length > 0 ? byRarity(rarity) : cardPool
    const card = pick(pool)
    if (card) cards.push(card)
  }

  return cards
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // User client (respects RLS for reads)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { authorization: authHeader } } }
    )

    // Service client (bypasses RLS for writes)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { packId } = await req.json() as { packId: string }

    // Fetch pack + price
    const { data: pack, error: packError } = await userClient
      .from('packs')
      .select('id, price, card_pool')
      .eq('id', packId)
      .single()

    if (packError || !pack) {
      return new Response(JSON.stringify({ error: 'Pack not found' }), { status: 404, headers: corsHeaders })
    }

    // Validate and deduct currency atomically
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('currency')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.currency < pack.price) {
      return new Response(JSON.stringify({ error: 'Insufficient currency' }), { status: 400, headers: corsHeaders })
    }

    const { data: newCurrency, error: rpcError } = await serviceClient
      .rpc('increment_currency', { uid: user.id, delta: -pack.price })

    if (rpcError || newCurrency === null) {
      return new Response(JSON.stringify({ error: 'Currency update failed' }), { status: 500, headers: corsHeaders })
    }

    // Fetch cards in this pack's pool
    const { data: poolCards, error: poolError } = await serviceClient
      .from('cards')
      .select('id, rarity')
      .in('id', pack.card_pool)

    if (poolError || !poolCards || poolCards.length === 0) {
      return new Response(JSON.stringify({ error: 'Empty card pool' }), { status: 500, headers: corsHeaders })
    }

    const selectedIds = buildPack(poolCards as Card[])

    // Insert into user_collection
    const collectionRows = selectedIds.map(cardId => ({
      user_id: user.id,
      card_id: cardId,
    }))

    await serviceClient.from('user_collection').insert(collectionRows)

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

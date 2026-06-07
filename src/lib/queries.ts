import { supabase } from './supabase'
import type { Card, Pack, CollectionEntry, Profile, Binder } from '../types'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return data as Profile
}

export async function fetchPacks(): Promise<Pack[]> {
  const { data, error } = await supabase.from('packs').select('*')
  if (error || !data) return []
  return data as Pack[]
}

export async function fetchCollection(userId: string): Promise<CollectionEntry[]> {
  const { data, error } = await supabase
    .from('user_collection')
    .select('*, card:cards(*)')
    .eq('user_id', userId)
    .order('acquired_at', { ascending: false })
  if (error || !data) return []
  return data as CollectionEntry[]
}

export async function fetchCard(cardId: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single()
  if (error || !data) return null
  return data as Card
}

export async function claimDailyReward(userId: string): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'daily_reward')
    .gte('created_at', today)
    .maybeSingle()
  if (error) {
    console.error('[claimDailyReward] check existing failed:', error)
    return null
  }
  if (data) {
    console.log('[claimDailyReward] already claimed today')
    return null
  }

  const { error: insertError } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'daily_reward',
    amount: 50,
  })
  if (insertError) {
    console.error('[claimDailyReward] transaction insert failed:', insertError)
    return null
  }

  const { data: newCurrency, error: rpcError } = await supabase
    .rpc('increment_currency', { uid: userId, delta: 50 })
  if (rpcError || newCurrency === null) {
    console.error('[claimDailyReward] increment_currency RPC failed:', rpcError)
    return null
  }
  return newCurrency as number
}

export async function removeFromCollection(
  userId: string,
  cardId: string,
  quantity: number
): Promise<void> {
  const { data, error } = await supabase
    .from('user_collection')
    .select('count')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .single()

  if (error || !data) throw new Error('Failed to fetch collection entry')

  if (quantity >= (data as { count: number }).count) {
    const { error: delError } = await supabase
      .from('user_collection')
      .delete()
      .eq('user_id', userId)
      .eq('card_id', cardId)
    if (delError) throw new Error('Failed to delete collection entry')
  } else {
    const { error: updError } = await supabase
      .from('user_collection')
      .update({ count: (data as { count: number }).count - quantity })
      .eq('user_id', userId)
      .eq('card_id', cardId)
    if (updError) throw new Error('Failed to update collection entry')
  }
}

export async function fetchBinders(userId: string): Promise<Binder[]> {
  const { data, error } = await supabase
    .from('binders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data as Binder[]
}

export async function createBinder(userId: string, name: string, color: string): Promise<Binder> {
  const { data, error } = await supabase
    .from('binders')
    .insert({ user_id: userId, name, color })
    .select()
    .single()
  if (error || !data) throw new Error('Failed to create binder')
  return data as Binder
}

export async function updateBinder(
  binderId: string,
  patch: { name?: string; color?: string }
): Promise<void> {
  const { error } = await supabase
    .from('binders')
    .update(patch)
    .eq('id', binderId)
  if (error) throw new Error('Failed to update binder')
}

export async function deleteBinder(binderId: string): Promise<void> {
  const { error } = await supabase
    .from('binders')
    .delete()
    .eq('id', binderId)
  if (error) throw new Error('Failed to delete binder')
}

export async function moveCard(entryId: string, binderId: string | null): Promise<void> {
  const { error } = await supabase
    .from('user_collection')
    .update({ binder_id: binderId })
    .eq('id', entryId)
  if (error) throw new Error('Failed to move card')
}

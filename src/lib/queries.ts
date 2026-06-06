import { supabase } from './supabase'
import type { Card, Pack, CollectionEntry, Profile } from '../types'

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
  if (error) return null
  if (data) return null // already claimed

  const { error: insertError } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'daily_reward',
    amount: 50,
  })
  if (insertError) return null

  const { data: newCurrency, error: rpcError } = await supabase
    .rpc('increment_currency', { uid: userId, delta: 50 })
  if (rpcError || newCurrency === null) return null
  return newCurrency as number
}

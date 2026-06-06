import type { User } from '@supabase/supabase-js'

export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'holo_rare'
  | 'ultra_rare'
  | 'secret_rare'

export type HoloType = 'none' | 'standard' | 'reverse' | 'full_art' | 'rainbow'

export type Card = {
  id: string
  name: string
  set: string
  number: string
  rarity: Rarity
  image_url: string
  holo_type: HoloType
}

export type Pack = {
  id: string
  name: string
  price: number
  image_url: string
  card_pool: string[]
}

export type CollectionEntry = {
  id: string
  user_id: string
  card_id: string
  card: Card
  acquired_at: string
  count: number
}

export type Transaction = {
  id: string
  user_id: string
  type: 'pack_purchase' | 'daily_reward'
  amount: number
  created_at: string
}

export type Profile = {
  id: string
  username: string | null
  currency: number
}

export type AppState = {
  user: User | null
  currency: number
  collection: CollectionEntry[]
}

export type AppAction =
  | { type: 'SET_USER'; user: User | null }
  | { type: 'SET_CURRENCY'; currency: number }
  | { type: 'DEDUCT_CURRENCY'; amount: number }
  | { type: 'SET_COLLECTION'; collection: CollectionEntry[] }
  | { type: 'ADD_CARDS'; cards: CollectionEntry[] }

export type PackOpenResult = {
  cards: Card[]
  newCurrency: number
}

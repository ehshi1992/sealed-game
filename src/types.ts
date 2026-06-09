import type { User } from '@supabase/supabase-js'

export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'holo_rare'
  | 'ultra_rare'
  | 'secret_rare'

export type HoloType = 'none' | 'standard' | 'reverse' | 'full_art' | 'rainbow'

export type HoloMode = 'none' | 'full_holo' | 'reverse_holo' | 'subject_holo'

export type ArtworkBounds = {
  x: number  // 0–1 fraction of card width
  y: number  // 0–1 fraction of card height
  w: number  // 0–1 fraction of card width
  h: number  // 0–1 fraction of card height
}

export type HoloSeed = {
  x: number  // 0–1, shifts cosmo pattern horizontally
  y: number  // 0–1, shifts cosmo pattern vertically
}

export type Card = {
  id: string
  name: string
  set: string
  number: string
  rarity: Rarity
  image_url: string
  holo_type: HoloType
  // New metadata fields (optional — may be null on legacy rows)
  card_layout_type?: string
  artwork_bounds?: ArtworkBounds | null
  holo_seed?: HoloSeed | null
  subject_layer_url?: string | null
  supertype?: string | null
  subtypes?: string[] | null
  hp?: number | null
  types?: string[] | null
  artist?: string | null
  flavor_text?: string | null
  national_pokedex_numbers?: number[] | null
  set_name?: string | null
  set_code?: string | null
  rarity_raw?: string | null
}

export type Pack = {
  id: string
  name: string
  price: number
  image_url: string
  card_pool: string[]
}

export type Binder = {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export type CollectionEntry = {
  id: string
  user_id: string
  card_id: string
  card: Card
  acquired_at: string
  count: number
  holo_seed?: HoloSeed | null  // unique per card instance
  binder_id?: string | null
  binder_position?: number | null
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
  binders: Binder[]
}

export type AppAction =
  | { type: 'SET_USER'; user: User | null }
  | { type: 'SET_CURRENCY'; currency: number }
  | { type: 'DEDUCT_CURRENCY'; amount: number }
  | { type: 'SET_COLLECTION'; collection: CollectionEntry[] }
  | { type: 'ADD_CARDS'; cards: CollectionEntry[] }
  | { type: 'REMOVE_CARD'; cardId: string; quantity: number }
  | { type: 'SET_BINDERS'; binders: Binder[] }
  | { type: 'ADD_BINDER'; binder: Binder }
  | { type: 'UPDATE_BINDER'; binder: Binder }
  | { type: 'DELETE_BINDER'; binderId: string }
  | { type: 'MOVE_CARD'; entryId: string; binderId: string | null; position?: number | null }

export type PackOpenResult = {
  cards: Card[]
  newCurrency: number
}

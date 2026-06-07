import { describe, it, expect } from 'vitest'
import { reducer } from '../../context/AppContext'
import type { AppState, CollectionEntry } from '../../types'

const baseCard = {
  id: 'card-1', name: 'Bulbasaur', set: 'base1', number: '44',
  rarity: 'common' as const, image_url: '', holo_type: 'none' as const,
}

const baseEntry: CollectionEntry = {
  id: 'entry-1', user_id: 'user-1', card_id: 'card-1',
  card: baseCard, acquired_at: '', count: 3,
}

const baseState: AppState = { user: null, currency: 0, collection: [baseEntry], binders: [] }

describe('REMOVE_CARD reducer', () => {
  it('decrements count when quantity < count', () => {
    const next = reducer(baseState, { type: 'REMOVE_CARD', cardId: 'card-1', quantity: 1 })
    expect(next.collection[0].count).toBe(2)
  })

  it('removes entry when quantity equals count', () => {
    const next = reducer(baseState, { type: 'REMOVE_CARD', cardId: 'card-1', quantity: 3 })
    expect(next.collection).toHaveLength(0)
  })

  it('removes entry when quantity exceeds count', () => {
    const next = reducer(baseState, { type: 'REMOVE_CARD', cardId: 'card-1', quantity: 99 })
    expect(next.collection).toHaveLength(0)
  })

  it('is a no-op for unknown cardId', () => {
    const next = reducer(baseState, { type: 'REMOVE_CARD', cardId: 'card-999', quantity: 1 })
    expect(next.collection).toHaveLength(1)
  })
})

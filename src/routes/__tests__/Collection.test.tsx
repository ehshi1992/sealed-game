import { describe, it, expect } from 'vitest'
import type { AppAction, AppState, CollectionEntry } from '../../types'

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER': return { ...state, user: action.user }
    case 'SET_CURRENCY': return { ...state, currency: action.currency }
    case 'DEDUCT_CURRENCY': return { ...state, currency: Math.max(0, state.currency - action.amount) }
    case 'SET_COLLECTION': return { ...state, collection: action.collection }
    case 'ADD_CARDS': return { ...state, collection: [...action.cards, ...state.collection] }
    case 'REMOVE_CARD': {
      const entry = state.collection.find(e => e.card_id === action.cardId)
      if (!entry) return state
      if (action.quantity >= entry.count) {
        return { ...state, collection: state.collection.filter(e => e.card_id !== action.cardId) }
      }
      return {
        ...state,
        collection: state.collection.map(e =>
          e.card_id === action.cardId ? { ...e, count: e.count - action.quantity } : e
        ),
      }
    }
    default: return state
  }
}

const baseCard = {
  id: 'card-1', name: 'Bulbasaur', set: 'base1', number: '44',
  rarity: 'common' as const, image_url: '', holo_type: 'none' as const,
}

const baseEntry: CollectionEntry = {
  id: 'entry-1', user_id: 'user-1', card_id: 'card-1',
  card: baseCard, acquired_at: '', count: 3,
}

const baseState: AppState = { user: null, currency: 0, collection: [baseEntry] }

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

import { describe, it, expect } from 'vitest'
import type { AppAction, AppState, Binder, CollectionEntry } from '../../types'

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
    case 'SET_BINDERS':
      return { ...state, binders: action.binders }
    case 'ADD_BINDER':
      return { ...state, binders: [action.binder, ...state.binders] }
    case 'UPDATE_BINDER':
      return { ...state, binders: state.binders.map(b => b.id === action.binder.id ? action.binder : b) }
    case 'DELETE_BINDER':
      return {
        ...state,
        binders: state.binders.filter(b => b.id !== action.binderId),
        collection: state.collection.map(e =>
          e.binder_id === action.binderId ? { ...e, binder_id: null } : e
        ),
      }
    case 'MOVE_CARD':
      return {
        ...state,
        collection: state.collection.map(e =>
          e.id === action.entryId ? { ...e, binder_id: action.binderId } : e
        ),
      }
    default: return state
  }
}

const baseBinder: Binder = {
  id: 'binder-1', user_id: 'user-1', name: 'Holos', color: '#ff0000', created_at: '',
}

const baseCard = {
  id: 'card-1', name: 'Pikachu', set: 'base1', number: '58',
  rarity: 'common' as const, image_url: '', holo_type: 'none' as const,
}

const baseEntry: CollectionEntry = {
  id: 'entry-1', user_id: 'user-1', card_id: 'card-1',
  card: baseCard, acquired_at: '', count: 1, binder_id: null,
}

const baseState: AppState = {
  user: null, currency: 0,
  collection: [baseEntry],
  binders: [baseBinder],
}

describe('binder reducer', () => {
  it('SET_BINDERS replaces binders array', () => {
    const next = reducer({ ...baseState, binders: [] }, { type: 'SET_BINDERS', binders: [baseBinder] })
    expect(next.binders).toHaveLength(1)
    expect(next.binders[0].id).toBe('binder-1')
  })

  it('ADD_BINDER prepends to binders', () => {
    const newBinder: Binder = { ...baseBinder, id: 'binder-2', name: 'Rares' }
    const next = reducer(baseState, { type: 'ADD_BINDER', binder: newBinder })
    expect(next.binders[0].id).toBe('binder-2')
    expect(next.binders).toHaveLength(2)
  })

  it('UPDATE_BINDER replaces matching binder in place', () => {
    const updated: Binder = { ...baseBinder, name: 'Updated' }
    const next = reducer(baseState, { type: 'UPDATE_BINDER', binder: updated })
    expect(next.binders[0].name).toBe('Updated')
    expect(next.binders).toHaveLength(1)
  })

  it('DELETE_BINDER removes binder and nulls binder_id on collection entries', () => {
    const state: AppState = {
      ...baseState,
      collection: [{ ...baseEntry, binder_id: 'binder-1' }],
    }
    const next = reducer(state, { type: 'DELETE_BINDER', binderId: 'binder-1' })
    expect(next.binders).toHaveLength(0)
    expect(next.collection[0].binder_id).toBeNull()
  })

  it('MOVE_CARD sets binder_id on matching entry', () => {
    const next = reducer(baseState, { type: 'MOVE_CARD', entryId: 'entry-1', binderId: 'binder-1' })
    expect(next.collection[0].binder_id).toBe('binder-1')
  })

  it('MOVE_CARD with null binderId moves card to bulk', () => {
    const state: AppState = {
      ...baseState,
      collection: [{ ...baseEntry, binder_id: 'binder-1' }],
    }
    const next = reducer(state, { type: 'MOVE_CARD', entryId: 'entry-1', binderId: null })
    expect(next.collection[0].binder_id).toBeNull()
  })
})

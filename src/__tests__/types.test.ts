import type { Card, Pack, CollectionEntry, AppState, AppAction } from '../types'

describe('types compile', () => {
  it('Card type has required fields', () => {
    const card: Card = {
      id: '1',
      name: 'Pikachu',
      set: 'base1',
      number: '58',
      rarity: 'common',
      image_url: 'https://example.com/pikachu.png',
      holo_type: 'none',
    }
    expect(card.id).toBe('1')
  })

  it('AppState has user, currency, collection', () => {
    const state: AppState = { user: null, currency: 100, collection: [] }
    expect(state.currency).toBe(100)
  })
})

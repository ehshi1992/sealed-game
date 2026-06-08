import { describe, it, expect } from 'vitest'
import { shouldSkipCard, buildStoragePaths } from '../process-card-layers'

describe('shouldSkipCard', () => {
  it('skips trainer cards', () => {
    expect(shouldSkipCard({ card_layout_type: 'trainer', subject_layer_url: null, bg_layer_url: null }, false)).toBe(true)
  })

  it('skips energy cards', () => {
    expect(shouldSkipCard({ card_layout_type: 'energy', subject_layer_url: null, bg_layer_url: null }, false)).toBe(true)
  })

  it('skips already-processed cards without --force', () => {
    expect(shouldSkipCard({ card_layout_type: 'standard', subject_layer_url: 'https://...', bg_layer_url: 'https://...' }, false)).toBe(true)
  })

  it('does not skip already-processed cards with --force', () => {
    expect(shouldSkipCard({ card_layout_type: 'standard', subject_layer_url: 'https://...', bg_layer_url: 'https://...' }, true)).toBe(false)
  })

  it('does not skip unprocessed pokemon cards', () => {
    expect(shouldSkipCard({ card_layout_type: 'standard', subject_layer_url: null, bg_layer_url: null }, false)).toBe(false)
  })

  it('does not skip partially processed cards (only subject set)', () => {
    expect(shouldSkipCard({ card_layout_type: 'standard', subject_layer_url: 'https://...', bg_layer_url: null }, false)).toBe(false)
  })
})

describe('buildStoragePaths', () => {
  it('returns correct paths for a card id', () => {
    const paths = buildStoragePaths('neo1-1')
    expect(paths.subject).toBe('neo1-1/subject.png')
    expect(paths.bg).toBe('neo1-1/bg.png')
  })
})

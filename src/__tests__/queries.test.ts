import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
    },
  },
}))

import { fetchProfile, fetchPacks, fetchCollection } from '../lib/queries'

describe('fetchProfile', () => {
  it('returns null when no data', async () => {
    const result = await fetchProfile('user-123')
    expect(result).toBeNull()
  })
})

describe('fetchPacks', () => {
  it('returns empty array when no data', async () => {
    const result = await fetchPacks()
    expect(result).toEqual([])
  })
})

describe('fetchCollection', () => {
  it('returns empty array when no data', async () => {
    const result = await fetchCollection('user-123')
    expect(result).toEqual([])
  })
})

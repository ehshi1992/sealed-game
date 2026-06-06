import { describe, it, expect } from 'vitest'

// Extracted pure functions from edge function logic
function rollRarity(rand: number): string {
  if (rand < 0.60) return 'common'
  if (rand < 0.85) return 'uncommon'
  if (rand < 0.95) return 'rare'
  if (rand < 0.99) return 'holo_rare'
  return 'ultra_rare'
}

function buildPack(cardPool: Array<{ id: string; rarity: string }>, rand: () => number): string[] {
  const byRarity = (r: string) => cardPool.filter(c => c.rarity === r)
  const pick = (pool: Array<{ id: string }>) => pool[Math.floor(rand() * pool.length)]?.id

  const cards: string[] = []
  // 1 guaranteed rare or better
  const rarePool = cardPool.filter(c =>
    ['rare', 'holo_rare', 'ultra_rare', 'secret_rare'].includes(c.rarity)
  )
  const guaranteed = pick(rarePool) ?? pick(cardPool)
  if (guaranteed) cards.push(guaranteed)

  // Fill remaining 9 slots
  for (let i = 1; i < 10; i++) {
    const rarity = rollRarity(rand())
    const pool = byRarity(rarity).length > 0 ? byRarity(rarity) : cardPool
    const card = pick(pool)
    if (card) cards.push(card)
  }

  return cards
}

describe('rollRarity', () => {
  it('returns common for rand < 0.60', () => expect(rollRarity(0.0)).toBe('common'))
  it('returns uncommon for rand 0.60–0.85', () => expect(rollRarity(0.70)).toBe('uncommon'))
  it('returns rare for rand 0.85–0.95', () => expect(rollRarity(0.90)).toBe('rare'))
  it('returns holo_rare for rand 0.95–0.99', () => expect(rollRarity(0.97)).toBe('holo_rare'))
  it('returns ultra_rare for rand >= 0.99', () => expect(rollRarity(0.995)).toBe('ultra_rare'))
})

describe('buildPack', () => {
  const pool = [
    { id: 'c1', rarity: 'common' },
    { id: 'c2', rarity: 'uncommon' },
    { id: 'c3', rarity: 'rare' },
    { id: 'c4', rarity: 'holo_rare' },
  ]
  let callCount = 0
  const deterministicRand = () => {
    callCount++
    return (callCount * 0.07) % 1
  }

  it('returns 10 cards', () => {
    callCount = 0
    expect(buildPack(pool, deterministicRand)).toHaveLength(10)
  })

  it('first card is rare or better', () => {
    callCount = 0
    const result = buildPack(pool, deterministicRand)
    expect(['c3', 'c4']).toContain(result[0])
  })
})

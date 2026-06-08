import { describe, it, expect } from 'vitest'
import { calcTearPct, shouldFlyOff } from './packRipLogic'

describe('calcTearPct', () => {
  it('returns 0 at no drag', () => {
    expect(calcTearPct(0, 80)).toBe(0)
  })
  it('returns 0.5 at half threshold', () => {
    expect(calcTearPct(40, 80)).toBe(0.5)
  })
  it('clamps to 1 beyond threshold', () => {
    expect(calcTearPct(100, 80)).toBe(1)
  })
  it('handles negative dx (drag left)', () => {
    expect(calcTearPct(-40, 80)).toBe(0.5)
  })
})

describe('shouldFlyOff', () => {
  it('triggers when distance meets threshold', () => {
    expect(shouldFlyOff(130, 130, 0, 0.6)).toBe(true)
  })
  it('does not trigger below distance and velocity', () => {
    expect(shouldFlyOff(100, 130, 0.3, 0.6)).toBe(false)
  })
  it('triggers on velocity alone', () => {
    expect(shouldFlyOff(50, 130, 0.6, 0.6)).toBe(true)
  })
  it('triggers above distance threshold regardless of velocity', () => {
    expect(shouldFlyOff(200, 130, 0, 0.6)).toBe(true)
  })
})

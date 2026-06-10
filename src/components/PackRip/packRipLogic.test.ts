import { describe, it, expect } from 'vitest'
import { shouldFlyOff } from './packRipLogic'

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

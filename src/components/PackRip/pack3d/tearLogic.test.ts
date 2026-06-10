import { describe, it, expect } from 'vitest'
import { tearProgress, shouldRip, clampTearX, TEAR, } from './tearLogic'

describe('tearProgress', () => {
  it('is 0 at the left pack edge', () => {
    expect(tearProgress(-TEAR.PACK_W / 2)).toBe(0)
  })
  it('is 1 at the right pack edge', () => {
    expect(tearProgress(TEAR.PACK_W / 2)).toBe(1)
  })
  it('is 0.5 at pack center', () => {
    expect(tearProgress(0)).toBeCloseTo(0.5)
  })
  it('clamps below 0 (rest position is off the left edge)', () => {
    expect(tearProgress(TEAR.LEFT_EDGE)).toBe(0)
  })
  it('clamps above 1', () => {
    expect(tearProgress(TEAR.RIPPED)).toBe(1)
  })
})

describe('shouldRip', () => {
  it('rips past 60% progress regardless of velocity', () => {
    expect(shouldRip(0.61, 0)).toBe(true)
  })
  it('does not rip at exactly 60%', () => {
    expect(shouldRip(0.6, 0)).toBe(false)
  })
  it('rips on fast flick past 30% progress', () => {
    expect(shouldRip(0.31, 5.1)).toBe(true)
  })
  it('does not rip on fast flick below 30% progress', () => {
    expect(shouldRip(0.29, 9)).toBe(false)
  })
  it('does not rip on slow drag below threshold', () => {
    expect(shouldRip(0.5, 1)).toBe(false)
  })
})

describe('clampTearX', () => {
  it('passes through values below the right drag edge', () => {
    expect(clampTearX(0)).toBe(0)
  })
  it('clamps to RIGHT_EDGE', () => {
    expect(clampTearX(99)).toBe(TEAR.RIGHT_EDGE)
  })
})

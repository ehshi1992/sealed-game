import { describe, it, expect } from 'vitest'
import { getLayoutBounds } from '../process-holo-masks'

describe('getLayoutBounds', () => {
  it('returns standard bounds for unknown layout type', () => {
    expect(getLayoutBounds('unknown')).toEqual({ x: 0.07, y: 0.11, w: 0.86, h: 0.36 })
  })
  it('returns full coverage for full_art', () => {
    expect(getLayoutBounds('full_art')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
  it('returns top-anchored bounds for v_vmax', () => {
    const b = getLayoutBounds('v_vmax')
    expect(b.x).toBe(0)
    expect(b.y).toBe(0)
    expect(b.h).toBe(0.65)
  })
  it('returns trainer bounds', () => {
    expect(getLayoutBounds('trainer')).toEqual({ x: 0.20, y: 0.12, w: 0.60, h: 0.28 })
  })
  it('returns energy bounds same as trainer', () => {
    expect(getLayoutBounds('energy')).toEqual(getLayoutBounds('trainer'))
  })
  it('returns wider art window for ex_gx vs standard', () => {
    const ex = getLayoutBounds('ex_gx')
    const std = getLayoutBounds('standard')
    expect(ex.h).toBeGreaterThan(std.h)
  })
})

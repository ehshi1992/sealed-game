import { describe, it, expect } from 'vitest'
import { deriveLayoutType } from '../seed-cards'

describe('deriveLayoutType', () => {
  it('returns energy for Energy supertype', () => {
    expect(deriveLayoutType('Energy', [], '')).toBe('energy')
  })
  it('returns trainer for Trainer supertype', () => {
    expect(deriveLayoutType('Trainer', [], '')).toBe('trainer')
  })
  it('returns full_art for Secret rarity', () => {
    expect(deriveLayoutType('Pokémon', [], 'Rare Secret')).toBe('full_art')
  })
  it('returns full_art for Full Art rarity', () => {
    expect(deriveLayoutType('Pokémon', [], 'Rare Ultra Full Art')).toBe('full_art')
  })
  it('returns v_vmax for VMAX subtype', () => {
    expect(deriveLayoutType('Pokémon', ['VMAX'], 'Rare Holo VMAX')).toBe('v_vmax')
  })
  it('returns v_vmax for VSTAR subtype', () => {
    expect(deriveLayoutType('Pokémon', ['VSTAR'], 'Rare Holo VSTAR')).toBe('v_vmax')
  })
  it('returns ex_gx for GX subtype', () => {
    expect(deriveLayoutType('Pokémon', ['GX'], 'Rare Holo GX')).toBe('ex_gx')
  })
  it('returns ex_gx for V subtype', () => {
    expect(deriveLayoutType('Pokémon', ['V'], 'Rare Holo V')).toBe('ex_gx')
  })
  it('returns standard for plain Basic Pokémon', () => {
    expect(deriveLayoutType('Pokémon', ['Basic'], 'Rare Holo')).toBe('standard')
  })
})

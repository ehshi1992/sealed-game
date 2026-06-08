import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import HoloCard from '../HoloCard'
import type { Card } from '../../../types'

const holoCard: Card = {
  id: '1',
  name: 'Charizard',
  set: 'base1',
  number: '4',
  rarity: 'holo_rare',
  image_url: 'https://example.com/card.png',
  holo_type: 'standard',
  artwork_bounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

describe('HoloCard', () => {
  it('renders canvas overlay for lg holo card', () => {
    const { container } = render(
      <HoloCard card={holoCard} size="lg" holoSeed={{ x: 0.3, y: 0.7 }} />
    )
    expect(container.querySelector('canvas.card__holo-canvas')).not.toBeNull()
  })

  it('still renders canvas for lg none holo type (shader outputs transparent)', () => {
    const { container } = render(
      <HoloCard card={{ ...holoCard, holo_type: 'none' }} size="lg" />
    )
    expect(container.querySelector('canvas.card__holo-canvas')).not.toBeNull()
  })

  it('skips canvas overlay for sm cards', () => {
    const { container } = render(
      <HoloCard card={holoCard} size="sm" />
    )
    expect(container.querySelector('canvas.card__holo-canvas')).toBeNull()
  })

  it('skips canvas overlay for md cards', () => {
    const { container } = render(
      <HoloCard card={holoCard} size="md" />
    )
    expect(container.querySelector('canvas.card__holo-canvas')).toBeNull()
  })

  it('renders card image', () => {
    const { container } = render(<HoloCard card={holoCard} />)
    const img = container.querySelector('img.card__img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('card.png')
  })
})

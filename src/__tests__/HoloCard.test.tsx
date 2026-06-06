import { render, screen, fireEvent } from '@testing-library/react'
import HoloCard from '../components/HoloCard/HoloCard'
import type { Card } from '../types'

const mockCard: Card = {
  id: '1',
  name: 'Charizard',
  set: 'base1',
  number: '4',
  rarity: 'holo_rare',
  image_url: 'https://example.com/charizard.png',
  holo_type: 'standard',
}

describe('HoloCard', () => {
  it('renders card image with correct alt text', () => {
    render(<HoloCard card={mockCard} />)
    expect(screen.getByAltText('Charizard')).toBeInTheDocument()
  })

  it('sets data-holo-type attribute from card.holo_type', () => {
    const { container } = render(<HoloCard card={mockCard} />)
    expect(container.firstChild).toHaveAttribute('data-holo-type', 'standard')
  })

  it('renders with holo-type none for common card', () => {
    const common: Card = { ...mockCard, rarity: 'common', holo_type: 'none' }
    const { container } = render(<HoloCard card={common} />)
    expect(container.firstChild).toHaveAttribute('data-holo-type', 'none')
  })

  it('updates CSS vars on mouse move', () => {
    const { container } = render(<HoloCard card={mockCard} />)
    const card = container.firstChild as HTMLElement
    fireEvent.mouseMove(card, { clientX: 100, clientY: 100 })
    expect(card.style.getPropertyValue('--rotateX')).not.toBe('')
  })

  it('resets CSS vars on mouse leave', () => {
    const { container } = render(<HoloCard card={mockCard} />)
    const card = container.firstChild as HTMLElement
    fireEvent.mouseMove(card, { clientX: 100, clientY: 100 })
    fireEvent.mouseLeave(card)
    expect(card.style.getPropertyValue('--rotateX')).toBe('0deg')
  })
})

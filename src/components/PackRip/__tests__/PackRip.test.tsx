import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PackRip from '../PackRip'
import type { Card } from '../../../types'

// Stub the 3D scene (r3f Canvas can't run in jsdom). Expose a button that fires
// onTornAway so the test can advance from the 'pack' phase to 'dealing'.
vi.mock('../pack3d/PackTearScene', () => ({
  default: ({ onTornAway, onReady }: { onTornAway: () => void; onReady?: () => void }) => {
    onReady?.()
    return <button data-testid="tear" onClick={onTornAway}>tear</button>
  },
}))

// Stub the overlay so we only assert on its presence, not WebGL.
vi.mock('../../HoloBatch/HoloBatchCanvas', () => ({
  default: () => <div data-testid="holo-batch" />,
}))

const card = (id: string): Card => ({
  id, name: id, set: 's', number: id, rarity: 'common',
  image_url: '', holo_type: 'standard',
  artwork_bounds: { x: 0.07, y: 0.11, w: 0.86, h: 0.36 },
} as Card)

const cards = [card('a'), card('b'), card('c')]

function renderPack() {
  return render(
    <MemoryRouter>
      <PackRip packImageUrl="" cards={cards} onComplete={() => {}} />
    </MemoryRouter>
  )
}

describe('PackRip holo overlay', () => {
  it('does not render the overlay during the pack phase', () => {
    renderPack()
    expect(screen.queryByTestId('holo-batch')).toBeNull()
  })

  it('renders the overlay once dealing starts', async () => {
    renderPack()
    screen.getByTestId('tear').click()
    expect(await screen.findByTestId('holo-batch')).toBeInTheDocument()
  })
})

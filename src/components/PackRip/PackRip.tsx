import { useState, useEffect } from 'react'
import type { Card } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import './PackRip.css'

type Phase =
  | 'idle'
  | 'shaking'
  | 'tearing'
  | 'revealing'
  | 'done'

type Props = {
  packImageUrl: string
  cards: Card[]
  onComplete: () => void
}

export default function PackRip({ packImageUrl, cards, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [revealedCount, setRevealedCount] = useState(0)

  useEffect(() => {
    if (phase === 'revealing' && cards.length > 0) {
      setFlipped(new Array(cards.length).fill(false))
      // Stagger card reveal
      let i = 0
      const interval = setInterval(() => {
        i++
        setRevealedCount(i)
        if (i >= cards.length) clearInterval(interval)
      }, 150)
      return () => clearInterval(interval)
    }
  }, [phase, cards.length])

  function handlePackClick() {
    if (phase !== 'idle') return
    setPhase('shaking')
    setTimeout(() => setPhase('tearing'), 500)
    setTimeout(() => setPhase('revealing'), 900)
  }

  function handleCardFlip(index: number) {
    setFlipped(prev => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }

  function allFlipped() {
    return flipped.length > 0 && flipped.every(Boolean)
  }

  return (
    <div className="pack-rip">
      {(phase === 'idle' || phase === 'shaking' || phase === 'tearing') && (
        <>
          <div
            className={`pack-rip__pack${phase === 'shaking' ? ' pack-rip__pack--shaking' : ''}`}
            onClick={handlePackClick}
          >
            <img
              src={packImageUrl}
              alt="Pack"
              className={`pack-rip__top${phase === 'tearing' ? ' pack-rip__top--tearing' : ''}`}
            />
            <img
              src={packImageUrl}
              alt=""
              aria-hidden
              className={`pack-rip__bottom${phase === 'tearing' ? ' pack-rip__bottom--tearing' : ''}`}
            />
          </div>
          {phase === 'idle' && (
            <p className="pack-rip__hint">Click the pack to open it</p>
          )}
        </>
      )}

      {(phase === 'revealing' || phase === 'done') && (
        <>
          <div className="pack-rip__cards">
            {cards.slice(0, revealedCount).map((card, i) => (
              <div
                key={card.id + i}
                className="pack-rip__card-slot"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="card-flip" onClick={() => handleCardFlip(i)}>
                  <div className={`card-flip__inner${flipped[i] ? ' card-flip__inner--flipped' : ''}`}>
                    <div className="card-flip__front card-back">✦</div>
                    <div className="card-flip__back">
                      <HoloCard card={card} size="md" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {revealedCount < cards.length && (
            <p className="pack-rip__hint">Cards incoming…</p>
          )}

          {revealedCount >= cards.length && !allFlipped() && (
            <p className="pack-rip__hint">Tap cards to reveal</p>
          )}

          {allFlipped() && (
            <div className="pack-rip__actions">
              <button className="btn btn--primary" onClick={onComplete}>
                Add to Collection
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

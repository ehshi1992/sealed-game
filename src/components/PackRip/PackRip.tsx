import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Card } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import ParticleBurst from '../ParticleBurst/ParticleBurst'
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
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [revealedCount, setRevealedCount] = useState(0)
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

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
    const card = cards[index]
    if (card && (card.rarity === 'secret_rare' || card.rarity === 'ultra_rare')) {
      const el = cardRefs.current[index]
      if (el) {
        const rect = el.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        setBurst({ x, y })
        setTimeout(() => setBurst(null), 1500)
      }
    }
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
                ref={el => { cardRefs.current[i] = el }}
                className={`pack-rip__card-slot${card.rarity === 'secret_rare' || card.rarity === 'ultra_rare' ? ' pack-rip__card-slot--rare' : ''}`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="card-flip" onClick={() => handleCardFlip(i)}>
                  <div className={`card-flip__inner${flipped[i] ? ' card-flip__inner--flipped' : ''}`}>
                    <div className="card-flip__front card-back">✦</div>
                    <div className="card-flip__back">
                      <HoloCard card={card} size="sm" />
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
              <button className="btn btn--secondary" onClick={() => navigate('/shop')}>
                ← Back to Shop
              </button>
              <button className="btn btn--primary" onClick={onComplete}>
                Add to Collection
              </button>
            </div>
          )}
        </>
      )}
      {burst && <ParticleBurst x={burst.x} y={burst.y} active={true} />}
    </div>
  )
}

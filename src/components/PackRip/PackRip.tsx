import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Card } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import ParticleBurst from '../ParticleBurst/ParticleBurst'
import './PackRip.css'

type Phase = 'idle' | 'grabbed' | 'tearing' | 'discarded' | 'dealing' | 'summary'

type Props = {
  packImageUrl: string
  cards: Card[]
  onComplete: () => void
}

const TEAR_THRESHOLD = 80   // px horizontal drag to trigger tear
const TEAR_VELOCITY  = 0.5  // px/ms — fast flick also triggers

export default function PackRip({ packImageUrl, cards, onComplete }: Props) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [dealIndex, setDealIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null)

  const packRef      = useRef<HTMLDivElement>(null)
  const grabXRef     = useRef(0)
  const grabTimeRef  = useRef(0)
  const cardDealRef  = useRef<HTMLDivElement>(null)
  const mountedRef   = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Drag handlers ──────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'idle') return
    e.currentTarget.setPointerCapture(e.pointerId)
    grabXRef.current    = e.clientX
    grabTimeRef.current = performance.now()
    setPhase('grabbed')
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'grabbed') return
    const dx = Math.abs(e.clientX - grabXRef.current)
    packRef.current?.style.setProperty('--tear-dx', `${dx / 2}px`)
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'grabbed') return
    const dx  = Math.abs(e.clientX - grabXRef.current)
    const dt  = performance.now() - grabTimeRef.current
    const vel = dt > 0 ? dx / dt : 0

    if (dx >= TEAR_THRESHOLD || vel >= TEAR_VELOCITY) {
      doTear()
    } else {
      snapBack()
    }
  }

  function handlePointerCancel() {
    if (phase === 'grabbed') snapBack()
  }

  function snapBack() {
    packRef.current?.style.setProperty('--tear-dx', '0px')
    setPhase('idle')
  }

  function doTear() {
    setPhase('tearing')
    setTimeout(() => {
      if (!mountedRef.current) return
      setPhase('discarded')
      setDealIndex(0)
      setFlipped(false)
      setTimeout(() => {
        if (!mountedRef.current) return
        setPhase('dealing')
      }, 100)
    }, 450)
  }

  // ── Deal handlers ──────────────────────────────────────
  function handleDealClick() {
    if (phase !== 'dealing') return
    if (!flipped) {
      // Flip current card face-up
      setFlipped(true)
      const card = cards[dealIndex]
      if (card && (card.rarity === 'secret_rare' || card.rarity === 'ultra_rare')) {
        const el = cardDealRef.current
        if (el) {
          const rect = el.getBoundingClientRect()
          setBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          setTimeout(() => setBurst(null), 1500)
        }
      }
    } else {
      // Advance to next card or summary
      const next = dealIndex + 1
      if (next >= cards.length) {
        setPhase('summary')
      } else {
        setDealIndex(next)
        setFlipped(false)
      }
    }
  }

  const currentCard = cards[dealIndex]

  return (
    <div className="pack-rip">

      {/* ── Pack (idle / grabbed / tearing) ── */}
      {(phase === 'idle' || phase === 'grabbed' || phase === 'tearing') && (
        <>
          <div
            ref={packRef}
            className={[
              'pack-rip__pack',
              phase === 'idle'    ? 'pack-rip__pack--idle'    : '',
              phase === 'grabbed' ? 'pack-rip__pack--grabbed' : '',
            ].join(' ').trim()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <img
              src={packImageUrl}
              alt="Pack"
              className={`pack-rip__left${phase === 'tearing' ? ' pack-rip__left--tearing' : ''}`}
            />
            <img
              src={packImageUrl}
              alt=""
              aria-hidden
              className={`pack-rip__right${phase === 'tearing' ? ' pack-rip__right--tearing' : ''}`}
            />
          </div>
          {phase === 'idle' && (
            <p className="pack-rip__hint">Drag to rip open</p>
          )}
        </>
      )}

      {/* ── Deal phase — one card at a time ── */}
      {phase === 'dealing' && currentCard && (
        <div className="pack-rip__deal" onClick={handleDealClick}>
          <p className="pack-rip__progress">{dealIndex + 1} / {cards.length}</p>
          <div
            key={`deal-${dealIndex}`}
            ref={cardDealRef}
            className="pack-rip__deal-card card-flip"
          >
            <div className={`card-flip__inner${flipped ? ' card-flip__inner--flipped' : ''}`}>
              <div className="card-flip__front card-back">✦</div>
              <div className="card-flip__back">
                <HoloCard card={currentCard} size="sm" />
              </div>
            </div>
          </div>
          <p className="pack-rip__hint">
            {flipped
              ? dealIndex + 1 < cards.length ? 'Tap for next →' : 'Tap to see all'
              : 'Tap to reveal'}
          </p>
        </div>
      )}

      {/* ── Summary — all cards ── */}
      {phase === 'summary' && (
        <>
          <div className="pack-rip__summary">
            {cards.map((card, i) => (
              <div
                key={card.id + i}
                className={[
                  'pack-rip__card-slot',
                  card.rarity === 'secret_rare' || card.rarity === 'ultra_rare'
                    ? 'pack-rip__card-slot--rare'
                    : '',
                ].join(' ').trim()}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <HoloCard card={card} size="sm" />
              </div>
            ))}
          </div>
          <div className="pack-rip__actions">
            <button className="btn btn--secondary" onClick={() => navigate('/shop')}>
              ← Back to Shop
            </button>
            <button className="btn btn--primary" onClick={onComplete}>
              Add to Collection
            </button>
          </div>
        </>
      )}

      {burst && <ParticleBurst x={burst.x} y={burst.y} active={true} />}
    </div>
  )
}

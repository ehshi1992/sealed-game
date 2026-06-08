import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Card } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import ParticleBurst from '../ParticleBurst/ParticleBurst'
import './PackRip.css'
import { calcTearPct, shouldFlyOff } from './packRipLogic'

type Phase = 'idle' | 'grabbed' | 'tearing' | 'discarded' | 'dealing' | 'summary'

type Props = {
  packImageUrl: string
  cards: Card[]
  onComplete: () => void
}

const TEAR_THRESHOLD = 80   // px horizontal drag to trigger tear
const TEAR_VELOCITY  = 0.5  // px/ms — fast flick also triggers
const FLY_THRESHOLD  = 130
const FLY_VELOCITY   = 0.6

export default function PackRip({ packImageUrl, cards, onComplete }: Props) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [deckIndex, setDeckIndex] = useState(0)
  const [dragState, setDragState] = useState<{ dx: number; dy: number } | null>(null)
  const [flying, setFlying] = useState<{ dx: number; dy: number } | null>(null)
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null)

  const packRef      = useRef<HTMLDivElement>(null)
  const grabXRef     = useRef(0)
  const grabTimeRef  = useRef(0)
  const topCardRef   = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
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
    const dx = e.clientX - grabXRef.current
    const pct = calcTearPct(dx, TEAR_THRESHOLD)
    packRef.current?.style.setProperty('--tear-pct', String(pct))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'grabbed') return
    const dx  = Math.abs(e.clientX - grabXRef.current)
    const dt  = performance.now() - grabTimeRef.current
    const vel = dt > 0 ? dx / dt : 0

    if (shouldFlyOff(dx, TEAR_THRESHOLD, vel, TEAR_VELOCITY)) {
      doTear()
    } else {
      snapBack()
    }
  }

  function handlePointerCancel() {
    if (phase === 'grabbed') snapBack()
  }

  function snapBack() {
    packRef.current?.style.setProperty('--tear-pct', '0')
    setPhase('idle')
  }

  function doTear() {
    setPhase('tearing')
    setTimeout(() => {
      if (!mountedRef.current) return
      setPhase('discarded')
      setDeckIndex(0)
      setDragState(null)
      setFlying(null)
      setTimeout(() => {
        if (!mountedRef.current) return
        setPhase('dealing')
      }, 100)
    }, 450)
  }

  // ── Card drag handlers ─────────────────────────────────
  function handleCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'dealing' || flying) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartRef.current = { x: e.clientX, y: e.clientY, time: performance.now() }
  }

  function handleCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current || flying) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setDragState({ dx, dy })
  }

  function handleCardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const dt = performance.now() - dragStartRef.current.time
    const velocity = dt > 0 ? distance / dt : 0
    dragStartRef.current = null

    if (shouldFlyOff(distance, FLY_THRESHOLD, velocity, FLY_VELOCITY)) {
      flyCard(dx, dy)
    } else {
      setDragState(null)
    }
  }

  function handleCardPointerCancel() {
    dragStartRef.current = null
    setDragState(null)
  }

  function flyCard(dx: number, dy: number) {
    const card = cards[deckIndex]
    if (card && (card.rarity === 'secret_rare' || card.rarity === 'ultra_rare')) {
      const el = topCardRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        setBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        setTimeout(() => { if (mountedRef.current) setBurst(null) }, 1500)
      }
    }

    setDragState(null)
    setFlying({ dx: dx * 6, dy: dy * 6 })

    setTimeout(() => {
      if (!mountedRef.current) return
      const next = deckIndex + 1
      if (next >= cards.length) {
        setFlying(null)
        setPhase('summary')
      } else {
        setDeckIndex(next)
        setFlying(null)
      }
    }, 320)
  }

  const dragDistance = dragState
    ? Math.sqrt(dragState.dx ** 2 + dragState.dy ** 2)
    : 0
  const isCommitting = dragDistance > FLY_THRESHOLD * 0.75

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
            <div className="pack-rip__body">
              <img src={packImageUrl} alt="" aria-hidden />
            </div>
            <div className={`pack-rip__flap${phase === 'tearing' ? ' pack-rip__flap--tearing' : ''}`}>
              <img src={packImageUrl} alt="Pack" />
            </div>
            <div className="pack-rip__perf" aria-hidden>
              <svg width="100%" height="100%" viewBox="0 0 200 8" preserveAspectRatio="none">
                <line x1="8" y1="4" x2="90" y2="4" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeDasharray="5 3" />
                <line x1="110" y1="4" x2="192" y2="4" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeDasharray="5 3" />
                <polygon points="96,1 104,1 100,7" fill="rgba(255,255,255,0.95)" />
              </svg>
            </div>
          </div>
          {phase === 'idle' && (
            <p className="pack-rip__hint">Drag to rip open</p>
          )}
        </>
      )}

      {/* ── Dealing phase — draggable card deck ── */}
      {phase === 'dealing' && cards[deckIndex] && (
        <div className="pack-rip__deck">
          <p className="pack-rip__progress">{deckIndex + 1} / {cards.length}</p>
          <div className="pack-rip__deck-stack">
            {[2, 1].map(offset => {
              const idx = deckIndex + offset
              return (
                <div key={`peek-${offset}`} className={`deck-card deck-card--peek${offset}`}>
                  {idx < cards.length
                    ? <HoloCard card={cards[idx]} size="md" />
                    : <div className="card-back">✦</div>
                  }
                </div>
              )
            })}
            <div
              key={`deck-${deckIndex}`}
              ref={topCardRef}
              className={[
                'deck-card',
                'deck-card--top',
                dragState    ? 'deck-card--dragging'   : '',
                flying       ? 'deck-card--flying'     : '',
                isCommitting ? 'deck-card--committing' : '',
              ].join(' ').trim()}
              style={flying
                ? {
                    transform: `translate(${flying.dx}px, ${flying.dy}px) rotate(${Math.max(-20, Math.min(20, flying.dx / 8))}deg)`,
                    opacity: 0,
                  }
                : dragState
                  ? {
                      transform: `translate(${dragState.dx}px, ${dragState.dy}px) rotate(${Math.max(-20, Math.min(20, dragState.dx / 8))}deg)`,
                    }
                  : undefined
              }
              onPointerDown={handleCardPointerDown}
              onPointerMove={handleCardPointerMove}
              onPointerUp={handleCardPointerUp}
              onPointerCancel={handleCardPointerCancel}
            >
              <HoloCard card={cards[deckIndex]} size="md" />
            </div>
          </div>
          <p className="pack-rip__hint">Drag to reveal next</p>
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
                <HoloCard card={card} size="md" />
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

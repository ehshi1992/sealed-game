import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Card } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import ParticleBurst from '../ParticleBurst/ParticleBurst'
import PackTearScene from './pack3d/PackTearScene'
import HoloBatchCanvas from '../HoloBatch/HoloBatchCanvas'
import type { ArtworkBounds } from '../HoloBatch/HoloBatchCanvas'
import type { HoloEntry } from '../HoloBatch/types'
import './PackRip.css'
import { shouldFlyOff } from './packRipLogic'

type Phase = 'pack' | 'dealing' | 'summary'

type Props = {
  packImageUrl: string
  cards: Card[]
  onComplete: () => void
}

const FLY_THRESHOLD = 130
const FLY_VELOCITY  = 0.6

// Show the holo-cutoff slider panel only when the page is opened with ?debug=true.
const DEBUG_BOUNDS = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('debug') === 'true'

// Deterministic per-card seed so summary cards don't all shimmer at the same hue
// /offset. Cheap hash of the card id → two fractions in [0,1).
function seedFromId(id: string): { x: number; y: number } {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const u = (h >>> 0) / 0xffffffff
  return { x: u, y: (u * 1.618) % 1 }
}

export default function PackRip({ packImageUrl, cards, onComplete }: Props) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('pack')
  const [deckIndex, setDeckIndex] = useState(0)
  const [dragState, setDragState] = useState<{ dx: number; dy: number } | null>(null)
  const [flying, setFlying] = useState<{ dx: number; dy: number } | null>(null)
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null)
  const [packReady, setPackReady] = useState(false)
  // Dev-only: live-tune the holo cutoff rect (artwork_bounds) with sliders. Seeded
  // from the first card's bounds; bake the printed values back into the data.
  const [boundsOverride, setBoundsOverride] = useState<ArtworkBounds>(
    () => cards[0]?.artwork_bounds ?? { x: 0.06, y: 0.11, w: 0.88, h: 0.52 },
  )

  const topCardRef   = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const mountedRef   = useRef(true)
  const summarySlotsRef = useRef<Map<string, HTMLDivElement | null>>(new Map())
  // Viewport-normalized pointer driving the holo shimmer (not card tilt). Read
  // live by the overlay's RAF loop — no re-render.
  const pointerRef = useRef({ x: 0.5, y: 0.5 })
  const [, forceTick] = useState(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Preload + decode every card image (and subject layer) up front so advancing
  // the deck doesn't trigger a decode flash when the next card mounts on top.
  useEffect(() => {
    for (const c of cards) {
      const img = new Image()
      img.src = c.image_url
      img.decode?.().catch(() => {})
      if (c.subject_layer_url) {
        const s = new Image()
        s.src = c.subject_layer_url
        s.decode?.().catch(() => {})
      }
    }
  }, [cards])

  useEffect(() => { forceTick(t => t + 1) }, [phase, deckIndex])

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

  const holoEntries: HoloEntry[] = phase === 'dealing'
    ? (cards[deckIndex]
        ? [{
            id: `top-${deckIndex}`,
            el: topCardRef.current,
            getEl: () => topCardRef.current,
            card: cards[deckIndex],
            seed: seedFromId(cards[deckIndex].id),
          }]
        : [])
    : phase === 'summary'
      ? cards.map((c, i) => ({
          id: `sum-${c.id}-${i}`,
          el: summarySlotsRef.current.get(`${c.id}-${i}`) ?? null,
          getEl: () => summarySlotsRef.current.get(`${c.id}-${i}`) ?? null,
          card: c,
          seed: seedFromId(c.id),
        }))
      : []

  // Drive holo shimmer from the pointer. Does not tilt the card — only feeds the
  // shader's pointer uniform via the overlay's RAF loop.
  function handleRootPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    pointerRef.current = {
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    }
  }

  return (
    <div className="pack-rip" onPointerMove={handleRootPointerMove}>

      {/* ── Card deck — hidden until pack WebGL is ready, then sits underneath
            so it's revealed as the pack slides off. Progress + hint only appear once dealing. ── */}
      {((phase === 'pack' && packReady) || phase === 'dealing') && cards[deckIndex] && (
        <div className="pack-rip__deck">
          {phase === 'dealing' && (
            <p className="pack-rip__progress">{deckIndex + 1} / {cards.length}</p>
          )}
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
          {phase === 'dealing' && (
            <p className="pack-rip__hint">Drag to reveal next</p>
          )}
        </div>
      )}

      {/* ── 3D pack tear — overlays the deck; slides off to reveal it ── */}
      {phase === 'pack' && (
        <PackTearScene
          packImageUrl={packImageUrl}
          onTornAway={() => setPhase('dealing')}
          onReady={() => setPackReady(true)}
        />
      )}

      {/* ── Summary — all cards ── */}
      {phase === 'summary' && (
        <>
          <div className="pack-rip__summary">
            {cards.map((card, i) => (
              <div
                key={card.id + i}
                ref={el => { summarySlotsRef.current.set(`${card.id}-${i}`, el) }}
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
      {(phase === 'dealing' || phase === 'summary') && (
        <HoloBatchCanvas entries={holoEntries} pointerRef={pointerRef} boundsOverride={boundsOverride} />
      )}

      {DEBUG_BOUNDS && (phase === 'dealing' || phase === 'summary') && (
        <BoundsPanel value={boundsOverride} onChange={setBoundsOverride} />
      )}
    </div>
  )
}

// Dev-only slider panel to tune the holo cutoff rect around the portrait. Copy the
// printed values into the card's artwork_bounds once aligned.
function BoundsPanel({ value, onChange }: {
  value: ArtworkBounds
  onChange: (v: ArtworkBounds) => void
}) {
  const rows: { key: keyof ArtworkBounds; label: string }[] = [
    { key: 'x', label: 'left x' },
    { key: 'y', label: 'top y' },
    { key: 'w', label: 'width' },
    { key: 'h', label: 'height' },
  ]
  return (
    <div className="subject-adjust-panel">
      <div className="subject-adjust-panel__title">holo cutoff (artwork_bounds)</div>
      {rows.map(({ key, label }) => (
        <label key={key} className="subject-adjust-panel__row">
          <span>{label}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.002}
            value={value[key]}
            onChange={e => onChange({ ...value, [key]: Number(e.target.value) })}
          />
          <code>{value[key].toFixed(3)}</code>
        </label>
      ))}
      <div className="subject-adjust-panel__row">
        <code>{`{ "x": ${value.x.toFixed(3)}, "y": ${value.y.toFixed(3)}, "w": ${value.w.toFixed(3)}, "h": ${value.h.toFixed(3)} }`}</code>
      </div>
    </div>
  )
}

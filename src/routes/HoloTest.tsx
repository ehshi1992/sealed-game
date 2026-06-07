import { useRef, useCallback } from 'react'
import { useHoloShader } from '../components/HoloCard/useHoloShader'
import type { Card, ArtworkBounds, HoloMode, HoloSeed, HoloType } from '../types'
import '../components/HoloCard/HoloCard.css'

// Raw canvas: shows pattern on solid bg — no card image
function RawPattern({ bg, seed, holoType, artworkBounds }: {
  bg: string
  seed: HoloSeed
  holoType: HoloType
  artworkBounds: ArtworkBounds
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerRef = useRef({ x: 0.5, y: 0.5 })
  const holoMode: HoloMode = holoType === 'reverse' ? 'reverse_holo' : 'full_holo'

  useHoloShader(canvasRef, {
    enabled: true,
    seedOffset: seed,
    artworkBounds,
    holoMode,
    pointer: pointerRef.current,
  })

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    pointerRef.current.x = (e.clientX - rect.left) / rect.width
    pointerRef.current.y = (e.clientY - rect.top) / rect.height
  }, [])

  return (
    <div
      onMouseMove={handleMouseMove}
      style={{ width: 300, height: 418, background: bg, position: 'relative', borderRadius: '4.75%/3.5%', overflow: 'hidden', flexShrink: 0 }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'normal' }} />
    </div>
  )
}

// Full card with holo overlay
function HoloCardTest({ card }: { card: Card }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerRef = useRef({ x: 0.5, y: 0.5 })
  const holoMode: HoloMode = card.holo_type === 'reverse' ? 'reverse_holo' : 'full_holo'

  useHoloShader(canvasRef, {
    enabled: true,
    seedOffset: card.holo_seed ?? { x: 0.5, y: 0.5 },
    artworkBounds: card.artwork_bounds ?? null,
    holoMode,
    pointer: pointerRef.current,
  })

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = rect.width / 2, cy = rect.height / 2
    el.style.setProperty('--rotateX', `${((y - cy) / cy) * -12}deg`)
    el.style.setProperty('--rotateY', `${((x - cx) / cx) * 12}deg`)
    pointerRef.current.x = x / rect.width
    pointerRef.current.y = y / rect.height
  }, [])

  const handleLeave = useCallback(() => {
    const el = cardRef.current
    if (!el) return
    el.style.setProperty('--rotateX', '0deg')
    el.style.setProperty('--rotateY', '0deg')
    pointerRef.current.x = 0.5
    pointerRef.current.y = 0.5
  }, [])

  return (
    <div
      ref={cardRef}
      className={`card card--lg`}
      data-holo-type={card.holo_type}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
      style={{ '--rotateX': '0deg', '--rotateY': '0deg', '--bgX': '50%', '--bgY': '50%', '--mx': '50%', '--my': '50%', '--pointer-from-center': '0' } as React.CSSProperties}
    >
      <img className="card__img" src={card.image_url} alt={card.name} />
      <div className="card__holo" />
      <div className="card__sparkle" />
      <div className="card__glare" />
      <canvas ref={canvasRef} className="card__holo-canvas" />
    </div>
  )
}

const BOUNDS_STANDARD: ArtworkBounds = { x: 0.07, y: 0.135, w: 0.86, h: 0.385 }
// Full card bounds for raw pattern testing — no clip
const BOUNDS_FULL: ArtworkBounds = { x: 0.0, y: 0.0, w: 1.0, h: 1.0 }

const TEST_CARDS: Card[] = [
  {
    id: 't1', name: 'Lugia (Neo Genesis)', set: 'neo1', number: '9',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo1/9_hires.png',
    holo_type: 'standard', artwork_bounds: BOUNDS_STANDARD,
    holo_seed: { x: 0.31, y: 0.72 },
  },
  {
    id: 't2', name: 'Feraligatr (Neo Genesis)', set: 'neo1', number: '4',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo1/4_hires.png',
    holo_type: 'standard', artwork_bounds: BOUNDS_STANDARD,
    holo_seed: { x: 0.55, y: 0.18 },
  },
  {
    id: 't3', name: 'Espeon (Neo Discovery)', set: 'neo2', number: '1',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo2/1_hires.png',
    holo_type: 'standard', artwork_bounds: BOUNDS_STANDARD,
    holo_seed: { x: 0.82, y: 0.43 },
  },
  {
    id: 't4', name: 'Ho-Oh (Neo Revelation)', set: 'neo3', number: '7',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo3/7_hires.png',
    holo_type: 'standard', artwork_bounds: BOUNDS_STANDARD,
    holo_seed: { x: 0.21, y: 0.67 },
  },
]

export default function HoloTest() {
  return (
    <div style={{ background: '#1a1a2e', minHeight: '100vh', padding: 32, fontFamily: 'monospace' }}>
      <h2 style={{ color: '#aaa', fontSize: 13, marginBottom: 24 }}>HOLO PATTERN TEST — raw on black | raw on white | card overlay</h2>

      {TEST_CARDS.map(card => (
        <div key={card.id} style={{ marginBottom: 48 }}>
          <div style={{ color: '#666', fontSize: 11, marginBottom: 8 }}>
            {card.name} · {card.holo_type} · seed ({card.holo_seed?.x.toFixed(2)}, {card.holo_seed?.y.toFixed(2)})
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ color: '#555', fontSize: 10 }}>raw / black</div>
              <RawPattern bg="#000" seed={card.holo_seed!} holoType={card.holo_type} artworkBounds={BOUNDS_FULL} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ color: '#555', fontSize: 10 }}>raw / white</div>
              <RawPattern bg="#fff" seed={card.holo_seed!} holoType={card.holo_type} artworkBounds={card.artwork_bounds!} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ color: '#555', fontSize: 10 }}>card overlay (hover me)</div>
              <HoloCardTest card={card} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// src/routes/PolygonTest.tsx
import { useState, useRef, useCallback, useEffect } from 'react'

interface PolygonData {
  card_id: string
  polygon: [number, number][]
  metrics: {
    vertex_count: number
    coverage_ratio: number
    mean_alpha: number
    contour_count: number
  }
}

const CARD_W = 300
const CARD_H = 418

// Test cards: Neo Genesis set, all with pre-computed polygon JSONs in public/polygon-test-data/
const TEST_CARDS: { card_id: string; name: string; image_url: string }[] = [
  { card_id: 'c547446a-5bf5-4080-ad6c-1fc861537507', name: 'Lugia',      image_url: 'https://images.pokemontcg.io/neo1/9_hires.png' },
  { card_id: '4dc55e78-6df4-40d6-a4d5-c6ac1f38a0e4', name: 'Typhlosion', image_url: 'https://images.pokemontcg.io/neo1/17_hires.png' },
  { card_id: '5fef1ee1-211d-4367-94c0-95463899f865', name: 'Pichu',      image_url: 'https://images.pokemontcg.io/neo1/12_hires.png' },
  { card_id: 'ac2b4f46-d2c0-40b1-b7f4-025e598f4ed2', name: 'Slowking',   image_url: 'https://images.pokemontcg.io/neo1/14_hires.png' },
  { card_id: '66e88721-2d33-4d84-ada6-03799aadaa48', name: 'Ampharos',   image_url: 'https://images.pokemontcg.io/neo1/1_hires.png' },
  { card_id: '5d767b1a-a226-4a36-b7bc-7729da207019', name: 'Meganium',   image_url: 'https://images.pokemontcg.io/neo1/10_hires.png' },
]

function PolygonCard({
  card,
  showPolygon,
  showHoloPreview,
}: {
  card: { card_id: string; name: string; image_url: string }
  showPolygon: boolean
  showHoloPreview: boolean
}) {
  const [polygonData, setPolygonData] = useState<PolygonData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pointerRef = useRef({ x: 0.5, y: 0.5 })
  const [hue, setHue] = useState(160)

  useEffect(() => {
    fetch(`/polygon-test-data/${card.card_id}.json`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setPolygonData)
      .catch(e => setError(String(e)))
  }, [card.card_id])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    pointerRef.current = { x, y }
    if (showHoloPreview) {
      setHue(Math.round(x * 360))
    }
  }, [showHoloPreview])

  const handleLeave = useCallback(() => {
    pointerRef.current = { x: 0.5, y: 0.5 }
    setHue(160)
  }, [])

  const polygonPoints = polygonData?.polygon
    .map(([px, py]) => `${px * CARD_W},${py * CARD_H}`)
    .join(' ')

  const fillColor = showHoloPreview
    ? `hsla(${hue}, 80%, 60%, 0.3)`
    : 'rgba(0, 255, 128, 0.18)'
  const strokeColor = showHoloPreview
    ? `hsla(${hue}, 90%, 70%, 0.9)`
    : 'rgba(0, 255, 128, 0.9)'

  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ color: '#666', fontSize: 11, marginBottom: 6, fontFamily: 'monospace' }}>
        {card.name} · {card.card_id}
        {polygonData && (
          <span style={{ color: '#444', marginLeft: 12 }}>
            verts={polygonData.metrics.vertex_count}  cov={polygonData.metrics.coverage_ratio.toFixed(2)}  a={polygonData.metrics.mean_alpha.toFixed(0)}
          </span>
        )}
        {error && <span style={{ color: '#c44', marginLeft: 12 }}>ERR {error}</span>}
      </div>
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleLeave}
        style={{ position: 'relative', width: CARD_W, height: CARD_H, borderRadius: '4.75%/3.5%', overflow: 'hidden', flexShrink: 0 }}
      >
        <img
          src={card.image_url}
          alt={card.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {showPolygon && polygonPoints && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox={`0 0 ${CARD_W} ${CARD_H}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={polygonPoints}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="1.5"
            />
          </svg>
        )}
      </div>
    </div>
  )
}

export default function PolygonTest() {
  const [showPolygon, setShowPolygon] = useState(true)
  const [showHoloPreview, setShowHoloPreview] = useState(false)

  return (
    <div style={{ background: '#1a1a2e', minHeight: '100vh', padding: 32, fontFamily: 'monospace' }}>
      <h2 style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
        SUBJECT POLYGON TEST — hover card to preview holo offset
      </h2>

      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        <label style={{ color: '#888', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showPolygon}
            onChange={e => setShowPolygon(e.target.checked)}
          />
          show polygon
        </label>
        <label style={{ color: '#888', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showHoloPreview}
            onChange={e => setShowHoloPreview(e.target.checked)}
          />
          holo preview (hue tracks pointer)
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        {TEST_CARDS.map(card => (
          <PolygonCard
            key={card.card_id}
            card={card}
            showPolygon={showPolygon}
            showHoloPreview={showHoloPreview}
          />
        ))}
      </div>
    </div>
  )
}

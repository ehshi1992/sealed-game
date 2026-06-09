import { useRef, useCallback, useState } from 'react'
import { useHoloShader, DEFAULT_HOLO_PARAMS } from '../components/HoloCard/useHoloShader'
import type { HoloShaderParams } from '../components/HoloCard/useHoloShader'
import { deriveHoloMode } from '../components/HoloCard/HoloCard'
import type { Card, ArtworkBounds, HoloMode, HoloSeed, HoloType } from '../types'
import '../components/HoloCard/HoloCard.css'

// Raw canvas: shows pattern on solid bg — no card image
function RawPattern({ bg, seed, holoType, artworkBounds, params }: {
  bg: string
  seed: HoloSeed
  holoType: HoloType
  artworkBounds: ArtworkBounds
  params: HoloShaderParams
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
    params,
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
function HoloCardTest({ card, params, artworkBoundsOverride }: {
  card: Card
  params: HoloShaderParams
  artworkBoundsOverride?: ArtworkBounds
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerRef = useRef({ x: 0.5, y: 0.5 })
  const artworkBounds = artworkBoundsOverride ?? card.artwork_bounds ?? null
  const holoMode: HoloMode = deriveHoloMode(card)

  useHoloShader(canvasRef, {
    enabled: true,
    seedOffset: card.holo_seed ?? { x: 0.5, y: 0.5 },
    artworkBounds,
    holoMode,
    pointer: pointerRef.current,
    params,
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
      {artworkBounds && card.subject_layer_url && (
        <img className="card__subject-layer" src={card.subject_layer_url} alt="" draggable={false} />
      )}
    </div>
  )
}

const DEFAULT_BOUNDS: ArtworkBounds = { x: 0.123, y: 0.143, w: 0.742, h: 0.368 }
const BOUNDS_FULL: ArtworkBounds = { x: 0.0, y: 0.0, w: 1.0, h: 1.0 }

// Cards without artwork_bounds use dynamic bounds from sliders at render time
const TEST_CARDS: Card[] = [
  {
    id: 't0', name: 'Ampharos (Neo Genesis) — subject layer test', set: 'neo1', number: '1',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo1/1_hires.png',
    holo_type: 'standard', artwork_bounds: null,
    holo_seed: { x: 0.4, y: 0.4 },
    subject_layer_url: 'https://gcwqxxnaccxjmrndowbu.supabase.co/storage/v1/object/public/card-layers/66e88721-2d33-4d84-ada6-03799aadaa48/subject.png',
  },
  // base1
  {
    id: 'b1', name: 'Blastoise (Base Set)', set: 'base1', number: '2',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/base1/2_hires.png',
    holo_type: 'standard', artwork_bounds: null,
    holo_seed: { x: 0.62, y: 0.35 },
  },
  // neo1
  {
    id: 't1', name: 'Lugia (Neo Genesis)', set: 'neo1', number: '9',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo1/9_hires.png',
    holo_type: 'standard', artwork_bounds: null,
    holo_seed: { x: 0.31, y: 0.72 },
  },
  {
    id: 't2', name: 'Feraligatr (Neo Genesis)', set: 'neo1', number: '4',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo1/4_hires.png',
    holo_type: 'standard', artwork_bounds: null,
    holo_seed: { x: 0.55, y: 0.18 },
  },
  // neo2
  {
    id: 't3', name: 'Espeon (Neo Discovery)', set: 'neo2', number: '1',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo2/1_hires.png',
    holo_type: 'standard', artwork_bounds: null,
    holo_seed: { x: 0.82, y: 0.43 },
  },
  // neo3
  {
    id: 't4', name: 'Ho-Oh (Neo Revelation)', set: 'neo3', number: '7',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo3/7_hires.png',
    holo_type: 'standard', artwork_bounds: null,
    holo_seed: { x: 0.21, y: 0.67 },
  },
  // neo4
  {
    id: 't6', name: 'Umbreon (Neo Destiny)', set: 'neo4', number: '13',
    rarity: 'holo_rare', image_url: 'https://images.pokemontcg.io/neo4/13_hires.png',
    holo_type: 'standard', artwork_bounds: null,
    holo_seed: { x: 0.57, y: 0.29 },
  },
]

type SliderDef = {
  key: keyof HoloShaderParams
  label: string
  min: number
  max: number
  step: number
}

const HOLO_SLIDERS: SliderDef[] = [
  { key: 'brightness',      label: 'Brightness',       min: 0, max: 1,   step: 0.01 },
  { key: 'lumaScale',       label: 'Luma Scale',        min: 0, max: 1,   step: 0.01 },
  { key: 'saturation',      label: 'Saturation',        min: 0, max: 1,   step: 0.01 },
  { key: 'opacity',         label: 'Opacity',           min: 0, max: 2,   step: 0.01 },
  { key: 'tiltSensitivity', label: 'Tilt Sensitivity',  min: 0, max: 8,   step: 0.1  },
  { key: 'activationFloor', label: 'Activation Floor',  min: 0, max: 1,   step: 0.01 },
]

type BoundsKey = keyof ArtworkBounds

const BOUNDS_SLIDERS: { key: BoundsKey; label: string }[] = [
  { key: 'x', label: 'Portrait X' },
  { key: 'y', label: 'Portrait Y' },
  { key: 'w', label: 'Portrait W' },
  { key: 'h', label: 'Portrait H' },
]

export default function HoloTest() {
  const [params, setParams] = useState<HoloShaderParams>({ ...DEFAULT_HOLO_PARAMS })
  const [bounds, setBounds] = useState<ArtworkBounds>({ ...DEFAULT_BOUNDS })

  function setParam(key: keyof HoloShaderParams, val: number) {
    setParams(p => ({ ...p, [key]: val }))
  }

  function setBound(key: BoundsKey, val: number) {
    setBounds(b => ({ ...b, [key]: val }))
  }

  function reset() {
    setParams({ ...DEFAULT_HOLO_PARAMS })
    setBounds({ ...DEFAULT_BOUNDS })
  }

  return (
    <div style={{ background: '#1a1a2e', minHeight: '100vh', padding: 32, fontFamily: 'monospace' }}>
      <h2 style={{ color: '#aaa', fontSize: 13, marginBottom: 24 }}>HOLO PATTERN TEST — raw on black | raw on white | card overlay</h2>

      {/* Sticky control panel */}
      <div style={{
        position: 'sticky', top: 16, zIndex: 10, background: '#11112099',
        backdropFilter: 'blur(8px)', border: '1px solid #333', borderRadius: 8,
        padding: '12px 16px', marginBottom: 32,
      }}>
        {/* Holo params */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ color: '#555', fontSize: 10, width: '100%', marginBottom: -4 }}>HOLO</div>
          {HOLO_SLIDERS.map(({ key, label, min, max, step }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: 10 }}>
                <span>{label}</span>
                <span style={{ color: '#ccc' }}>{params[key].toFixed(2)}</span>
              </div>
              <input
                type="range" min={min} max={max} step={step} value={params[key]}
                onChange={e => setParam(key, parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#7c7cff', cursor: 'pointer' }}
              />
            </div>
          ))}
        </div>
        {/* Portrait bounds */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center' }}>
          <div style={{ color: '#555', fontSize: 10, width: '100%', marginBottom: -4 }}>PORTRAIT BOUNDS</div>
          {BOUNDS_SLIDERS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: 10 }}>
                <span>{label}</span>
                <span style={{ color: '#ccc' }}>{bounds[key].toFixed(3)}</span>
              </div>
              <input
                type="range" min={0} max={1} step={0.001} value={bounds[key]}
                onChange={e => setBound(key, parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#ff7c7c', cursor: 'pointer' }}
              />
            </div>
          ))}
          <div style={{ color: '#444', fontSize: 9, alignSelf: 'flex-end', paddingBottom: 2 }}>
            {`{x:${bounds.x.toFixed(3)}, y:${bounds.y.toFixed(3)}, w:${bounds.w.toFixed(3)}, h:${bounds.h.toFixed(3)}}`}
          </div>
          <button
            onClick={reset}
            style={{
              alignSelf: 'center', marginLeft: 'auto', padding: '4px 12px',
              background: '#2a2a4a', color: '#aaa', border: '1px solid #444',
              borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}
          >
            reset
          </button>
        </div>
      </div>

      {TEST_CARDS.map(card => (
        <div key={card.id} style={{ marginBottom: 48 }}>
          <div style={{ color: '#666', fontSize: 11, marginBottom: 8 }}>
            {card.name} · {card.holo_type} · seed ({card.holo_seed?.x.toFixed(2)}, {card.holo_seed?.y.toFixed(2)})
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ color: '#555', fontSize: 10 }}>raw / black</div>
              <RawPattern bg="#000" seed={card.holo_seed!} holoType={card.holo_type} artworkBounds={BOUNDS_FULL} params={params} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ color: '#555', fontSize: 10 }}>raw / white</div>
              <RawPattern bg="#fff" seed={card.holo_seed!} holoType={card.holo_type} artworkBounds={bounds} params={params} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ color: '#555', fontSize: 10 }}>card overlay (hover me)</div>
              <HoloCardTest card={card} params={params} artworkBoundsOverride={bounds} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

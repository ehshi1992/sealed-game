import { useRef, useCallback, useState } from 'react'
import type { Card, HoloMode, HoloSeed } from '../../types'
import { useHoloShader } from './useHoloShader'
import './HoloCard.css'

type Props = {
  card: Card
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  holoSeed?: HoloSeed
}

const CANVAS_SIZES = {
  sm: { width: 120, height: 167 },
  md: { width: 200, height: 279 },
  lg: { width: 300, height: 418 },
}

function deriveHoloMode(card: Card): HoloMode {
  if (card.holo_type === 'reverse') return 'reverse_holo'
  if (card.holo_type === 'none') return 'none'
  return 'full_holo'  // standard, full_art, rainbow
}

export default function HoloCard({
  card,
  size = 'md',
  interactive = true,
  holoSeed,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<HTMLCanvasElement>(null) as React.RefObject<HTMLCanvasElement>
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 })

  const canvasDims = CANVAS_SIZES[size]
  const seed: HoloSeed = holoSeed ?? { x: 0.5, y: 0.5 }
  const artworkBounds = card.artwork_bounds ?? null
  const holoMode = deriveHoloMode(card)

  useHoloShader(canvasRef, {
    seedOffset: seed,
    artworkBounds,
    holoMode,
    pointer,
  })

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const rotateX = ((y - cy) / cy) * -12
    const rotateY = ((x - cx) / cx) * 12
    const bgX = (x / rect.width) * 100
    const bgY = (y / rect.height) * 100
    const mx = (x / rect.width) * 100
    const my = (y / rect.height) * 100
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    const maxDist = Math.sqrt(cx ** 2 + cy ** 2)
    const pfc = dist / maxDist

    el.style.setProperty('--rotateX', `${rotateX}deg`)
    el.style.setProperty('--rotateY', `${rotateY}deg`)
    el.style.setProperty('--bgX', `${bgX}%`)
    el.style.setProperty('--bgY', `${bgY}%`)
    el.style.setProperty('--mx', `${mx}%`)
    el.style.setProperty('--my', `${my}%`)
    el.style.setProperty('--pointer-from-center', `${pfc}`)

    setPointer({ x: x / rect.width, y: y / rect.height })
  }, [interactive])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return
    const touch = e.touches[0]
    const el = cardRef.current
    if (!el || !touch) return
    const rect = el.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const rotateX = ((y - cy) / cy) * -12
    const rotateY = ((x - cx) / cx) * 12
    const bgX = (x / rect.width) * 100
    const bgY = (y / rect.height) * 100
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    const maxDist = Math.sqrt(cx ** 2 + cy ** 2)
    const pfc = dist / maxDist

    el.style.setProperty('--rotateX', `${rotateX}deg`)
    el.style.setProperty('--rotateY', `${rotateY}deg`)
    el.style.setProperty('--bgX', `${bgX}%`)
    el.style.setProperty('--bgY', `${bgY}%`)
    el.style.setProperty('--mx', `${bgX}%`)
    el.style.setProperty('--my', `${bgY}%`)
    el.style.setProperty('--pointer-from-center', `${pfc}`)

    setPointer({ x: x / rect.width, y: y / rect.height })
  }, [interactive])

  const handleLeave = useCallback(() => {
    const el = cardRef.current
    if (!el) return
    el.style.setProperty('--rotateX', '0deg')
    el.style.setProperty('--rotateY', '0deg')
    el.style.setProperty('--bgX', '50%')
    el.style.setProperty('--bgY', '50%')
    el.style.setProperty('--mx', '50%')
    el.style.setProperty('--my', '50%')
    el.style.setProperty('--pointer-from-center', '0')
    setPointer({ x: 0.5, y: 0.5 })
  }, [])

  return (
    <div
      ref={cardRef}
      className={`card card--${size}`}
      data-holo-type={card.holo_type}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleLeave}
      style={{
        '--rotateX': '0deg',
        '--rotateY': '0deg',
        '--bgX': '50%',
        '--bgY': '50%',
        '--mx': '50%',
        '--my': '50%',
        '--pointer-from-center': '0',
      } as React.CSSProperties}
    >
      <div className="card__translucent" />
      <img className="card__img" src={card.image_url} alt={card.name} loading="lazy" />
      <div className="card__holo" />
      <div className="card__sparkle" />
      <div className="card__glare" />
      <canvas
        ref={canvasRef}
        className="card__holo-canvas"
        width={canvasDims.width}
        height={canvasDims.height}
      />
    </div>
  )
}

import { useEffect, useRef } from 'react'

type Props = {
  x: number
  y: number
  active: boolean
}

const COLORS = ['#FFD700', '#FFA500', '#FFEC8B']
const PARTICLE_COUNT = 40
const TOTAL_FRAMES = 60

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  alpha: number
  radius: number
}

export default function ParticleBurst({ x, y, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 4 + Math.random() * 4
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 1,
        radius: 3 + Math.random() * 3,
      }
    })

    let frame = 0

    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      frame++
      const progress = frame / TOTAL_FRAMES

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.15 // gravity
        p.alpha = 1 - progress
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.alpha)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      if (frame < TOTAL_FRAMES) {
        rafRef.current = requestAnimationFrame(draw)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [active, x, y])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    />
  )
}

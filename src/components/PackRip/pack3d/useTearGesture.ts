// src/components/PackRip/pack3d/useTearGesture.ts
import { useSpring } from '@react-spring/three'
import { useDrag } from '@use-gesture/react'
import { TEAR, tearProgress, shouldRip, clampTearX } from './tearLogic'
import { CAMERA_Z, CAMERA_FOV } from './sceneConfig'

type Callbacks = {
  enabled: boolean       // only the idle/tearing phases accept drags
  onTearStart: () => void
  onRip: () => void      // rip spring finished — strip should start flying
  onSnapBack: () => void
}

function worldPerPx(): number {
  const vh = 2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * CAMERA_Z
  const aspect = window.innerWidth / window.innerHeight
  return (vh * aspect) / window.innerWidth
}

export function useTearGesture({ enabled, onTearStart, onRip, onSnapBack }: Callbacks) {
  const [{ x }, api] = useSpring(() => ({
    x: TEAR.LEFT_EDGE,
    config: { tension: 60, friction: 12 },
  }))

  const bind = useDrag(
    ({ first, last, movement: [mx], velocity: [vx] }) => {
      if (!enabled) return
      if (first) onTearStart()

      const next = clampTearX(TEAR.LEFT_EDGE + mx * worldPerPx())
      api.start({ x: next, immediate: true })

      if (last) {
        if (shouldRip(tearProgress(next), vx)) {
          api.start({
            x: TEAR.RIPPED,
            config: { tension: 400, friction: 20 },
            onRest: onRip,
          })
        } else {
          api.start({
            x: TEAR.LEFT_EDGE,
            config: { tension: 180, friction: 18 },
            onRest: onSnapBack,
          })
        }
      }
    },
    { pointer: { touch: true }, filterTaps: true }
  )

  return { bind, springX: x }
}

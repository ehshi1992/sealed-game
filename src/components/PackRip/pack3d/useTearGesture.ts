// src/components/PackRip/pack3d/useTearGesture.ts
import { useRef } from 'react'
import type { RefObject } from 'react'
import { useDrag } from '@use-gesture/react'
import { TEAR, tearProgress, shouldRip, clampTearX } from './tearLogic'
import { CAMERA_Z, CAMERA_FOV } from './sceneConfig'

type Callbacks = {
  enabled: boolean       // only the idle/tearing phases accept drags
  onTearStart: () => void
  onRip: () => void      // rip animation finished — strip should start flying
  onSnapBack: () => void
}

// Shared, mutable tear state. The gesture (outside the r3f <Canvas>) writes
// target/mode; PackMesh advances `x` toward `target` inside useFrame, so the
// animation is driven by r3f's own render loop. This avoids react-spring,
// whose frameloop does not advance when the spring is created outside Canvas.
export type TearController = {
  x: number              // current tear-front position (animated)
  target: number         // where x is heading
  mode: 'idle' | 'drag' | 'rip' | 'snap'
  frames: number         // incremented by PackMesh useFrame (debug: loop alive?)
  events: number         // incremented by the drag handler (debug: gesture firing?)
  onRip: () => void
  onSnapBack: () => void
}

function worldPerPx(): number {
  const vh = 2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * CAMERA_Z
  const aspect = window.innerWidth / window.innerHeight
  return (vh * aspect) / window.innerWidth
}

export function useTearGesture({ enabled, onTearStart, onRip, onSnapBack }: Callbacks): {
  bind: ReturnType<typeof useDrag>
  tear: RefObject<TearController>
} {
  const tear = useRef<TearController>({
    x: TEAR.LEFT_EDGE,
    target: TEAR.LEFT_EDGE,
    mode: 'idle',
    frames: 0,
    events: 0,
    onRip,
    onSnapBack,
  })
  // Keep the completion callbacks current without re-creating the ref.
  tear.current.onRip = onRip
  tear.current.onSnapBack = onSnapBack

  const bind = useDrag(
    ({ first, last, movement: [mx], velocity: [vx] }) => {
      tear.current.events++
      if (!enabled) return
      if (first) {
        onTearStart()
        tear.current.mode = 'drag'
      }

      const next = clampTearX(TEAR.LEFT_EDGE + mx * worldPerPx())
      tear.current.target = next

      if (last) {
        if (shouldRip(tearProgress(next), vx)) {
          tear.current.mode = 'rip'
          tear.current.target = TEAR.RIPPED
        } else {
          tear.current.mode = 'snap'
          tear.current.target = TEAR.LEFT_EDGE
        }
      }
    },
    { pointer: { touch: true }, filterTaps: true }
  )

  return { bind, tear }
}

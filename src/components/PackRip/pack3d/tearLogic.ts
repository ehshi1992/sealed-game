// Pure tear-gesture math — kept free of three/r3f so it runs under jsdom.

export const TEAR = {
  PACK_W: 2.2,
  PACK_H: 3.2,
  TEAR_Y: 1.06,
  LEFT_EDGE: -2.2 / 2 - 0.3,   // -1.4  rest position, off the left edge
  RIGHT_EDGE: 2.2 / 2 + 0.2,   //  1.3  clamp while dragging
  RIPPED: 2.2 / 2 + 0.6,       //  1.7  spring target when tear completes
  COMPLETE_THRESHOLD: 0.6,     // drag progress 0-1
  FLICK_VELOCITY: 5,           // world units/sec
  FLICK_MIN_PROGRESS: 0.3,
} as const

/** 0 at pack left edge → 1 at pack right edge, clamped. */
export function tearProgress(tearX: number): number {
  return Math.min(1, Math.max(0, (tearX + TEAR.PACK_W / 2) / TEAR.PACK_W))
}

/** Tear completes past 60% progress, or on a fast flick past 30%. */
export function shouldRip(progress: number, velocityX: number): boolean {
  return (
    progress > TEAR.COMPLETE_THRESHOLD ||
    (velocityX > TEAR.FLICK_VELOCITY && progress > TEAR.FLICK_MIN_PROGRESS)
  )
}

/** Clamp drag position so the tear front cannot overshoot while held. */
export function clampTearX(x: number): number {
  return Math.min(x, TEAR.RIGHT_EDGE)
}

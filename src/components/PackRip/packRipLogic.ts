export function calcTearPct(dx: number, threshold: number): number {
  return Math.min(1, Math.abs(dx) / threshold)
}

export function shouldFlyOff(
  distance: number,
  threshold: number,
  velocity: number,
  velocityThreshold: number
): boolean {
  return distance >= threshold || velocity >= velocityThreshold
}

export function shouldFlyOff(
  distance: number,
  threshold: number,
  velocity: number,
  velocityThreshold: number
): boolean {
  return distance >= threshold || velocity >= velocityThreshold
}

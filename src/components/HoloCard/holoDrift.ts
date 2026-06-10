// src/components/HoloCard/holoDrift.ts
// Passive shimmer drift. The holo shader derives its tilt (and thus the sweeping
// activation wave) entirely from the pointer, so a still pointer yields a dead,
// static card. This returns a pointer that always rotates over time, keeping the
// shimmer alive; an optional live pointer steers the shimmer on top of the drift.
// Shared by useHoloShader (single card / card detail) and HoloBatchCanvas (pack
// opening + collection) so both surfaces shimmer identically.
export function holoDriftPointer(
  timeMs: number,
  mouse?: { x: number; y: number } | null,
): { x: number; y: number } {
  const t = timeMs / 1000
  // Large, fairly quick sweep so the shimmer travels boldly across the card.
  const driftX = 0.7 * Math.sin(t * 0.7)
  const driftY = 0.5 * Math.sin(t * 0.45 + 1.0)
  if (!mouse) return { x: 0.5 + driftX, y: 0.5 + driftY }
  // Live pointer steers, but the drift keeps a strong baseline so a held-still
  // (or centered) mouse never kills the shimmer.
  return {
    x: 0.5 + (mouse.x - 0.5) * 0.6 + driftX * 0.85,
    y: 0.5 + (mouse.y - 0.5) * 0.6 + driftY * 0.85,
  }
}

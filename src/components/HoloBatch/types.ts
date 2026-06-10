// src/components/HoloBatch/types.ts
import type { Card, HoloSeed } from '../../types'

// One card opted into the batch holo overlay. The overlay tracks the card's
// on-screen rect each frame; entries that resolve to no element are skipped.
// Prefer `getEl` (resolved live each frame) so a freshly-mounted card's holo
// appears on the first frame instead of lagging a render behind a ref snapshot.
export interface HoloEntry {
  id: string
  el: HTMLElement | null
  getEl?: () => HTMLElement | null
  card: Card
  seed: HoloSeed
}

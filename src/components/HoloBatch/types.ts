// src/components/HoloBatch/types.ts
import type { Card, HoloSeed } from '../../types'

// One card opted into the batch holo overlay. `el` is the card's DOM element whose
// on-screen rect the overlay tracks each frame; null entries are skipped.
export interface HoloEntry {
  id: string
  el: HTMLElement | null
  card: Card
  seed: HoloSeed
}

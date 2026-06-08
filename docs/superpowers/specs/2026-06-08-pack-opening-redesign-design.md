# Pack Opening Redesign

**Date:** 2026-06-08  
**Scope:** `PackRip` component — pack rip interaction + card reveal deck

---

## Problems Being Solved

1. Pack splits vertically (left/right halves) but real booster packs tear horizontally across the top. No visual cue showing where to rip.
2. Card reveal is click-to-flip one card at a time. Should feel like spreading a fresh opened deck — drag to slide top card off, face-up cards already revealed.

---

## Approach

CSS clip-path with `--tear-pct` custom property. No canvas, no external libs. Fits existing `--tear-dx` pattern.

---

## Section 1: Pack Rip

### Structure

Three layers, all absolutely positioned inside `.pack-rip__pack` (200×280px unchanged):

```
.pack-rip__pack
  ├── .pack-rip__flap   — top ~15% of pack image (clip-path top strip)
  ├── .pack-rip__body   — bottom ~85% of pack image (clip-path bottom)
  └── .pack-rip__perf   — SVG dashed line + center notch at the split line
```

Both `flap` and `body` are `position: absolute; inset: 0` wrappers inside `.pack-rip__pack`. Each contains a full-size `<img>` (`width:100%; height:100%; object-fit:cover`). The clip-path cuts them cleanly:

```css
.pack-rip__flap { clip-path: inset(0 0 85% 0); }   /* top 15% */
.pack-rip__body { clip-path: inset(15% 0 0 0); }   /* bottom 85% */
```

At rest the image appears seamless — the two layers perfectly tile.

### CSS Custom Property

`--tear-pct` (0 → 1): set on every `pointermove` as:

```ts
const pct = Math.min(1, Math.abs(dx) / TEAR_THRESHOLD)
packRef.current?.style.setProperty('--tear-pct', String(pct))
```

### Idle State

- `pack-breathe` animation on `.pack-rip__pack--idle` (unchanged)
- Shimmer sweep kept (unchanged)
- `.pack-rip__perf` visible at low opacity (~0.3) with a small ▼ notch SVG centered — the "tear here" hint
- `hint-pulse` animation on the perf notch

### During Drag (grabbed phase)

Flap lifts and tilts as `--tear-pct` increases:

```css
.pack-rip__flap {
  transform: translateY(calc(var(--tear-pct) * -10px))
             rotate(calc(var(--tear-pct) * -3deg));
}
```

Perf line:
- Opacity: `0.3 + (0.7 * --tear-pct)` → fully visible at threshold
- `stroke-dashoffset` animates to simulate tearing (CSS animation driven by `--tear-pct`)
- Notch scales up slightly

Body: `pack-breathe` paused, subtle scale-up cue at high `--tear-pct`.

### Tear Trigger (unchanged threshold: 80px or 0.5px/ms velocity)

1. Phase → `'tearing'`
2. Flap gets `.pack-rip__flap--tearing` → `animation: flap-fly-off 0.4s ease-in forwards`
   - `translateY(-120vh) rotate(-15deg)`, opacity 0
3. Body stays in place
4. After 450ms: phase → `'discarded'` → `'dealing'` (same timing as today)

### Snap Back

`--tear-pct` reset to `0`. Flap/body return to rest via CSS `transition: transform 0.3s ease-out`.

---

## Section 2: Card Deck Reveal

### Visual Stack

`.pack-rip__deck` renders top 3 cards from `cards[deckIndex..]` at rest:

| Layer | Class | Transform | Z |
|-------|-------|-----------|---|
| Top card | `.deck-card--top` | `translate(0,0) rotate(0deg)` | 3 |
| Peek 1 | `.deck-card--peek1` | `translateY(4px) scale(0.97)` | 2 |
| Peek 2 | `.deck-card--peek2` | `translateY(8px) scale(0.94)` | 1 |

Cards are face-up `<HoloCard size="sm" />`.  
If `deckIndex + 1` or `+2` exceed `cards.length`, render a card-back placeholder to maintain stack depth visual.

### State

```ts
const [deckIndex, setDeckIndex] = useState(0)
const [dragState, setDragState] = useState<{ dx: number; dy: number } | null>(null)
const [flying, setFlying] = useState<{ dx: number; dy: number } | null>(null)
```

Remove: `dealIndex`, `flipped` (replaced by above).

### Drag Interaction (top card only)

```
FLY_THRESHOLD = 130px   // distance to trigger fly-off
FLY_VELOCITY  = 0.6     // px/ms fast flick
```

- `pointerdown` on `.deck-card--top`: capture pointer, record `startX/Y` + `startTime`
- `pointermove`: `dx = x - startX`, `dy = y - startY`; set `dragState`
- Top card live transform: `translate(dx, dy) rotate(clamp(-20deg, dx/8, 20deg))`
- `--drag-pct = distance / FLY_THRESHOLD` on container

**Visual commit cue at ~75%:** top card `drop-shadow` intensifies (lerped via `--drag-pct`).

- `pointerup`: compute `distance` and velocity
  - If `distance >= FLY_THRESHOLD` OR `velocity >= FLY_VELOCITY` → **fly off**
  - Else → **snap back** (clear `dragState`)

### Fly-Off Sequence

1. Set `flying = { dx, dy }` — top card transitions to `translate(dx*6, dy*6)` + opacity 0 in 320ms
2. Clear `dragState`
3. After 320ms:
   - Check if `deckIndex + 1 >= cards.length` → set phase `'summary'`
   - Else: `setDeckIndex(i => i + 1)`, clear `flying`
   - Peek cards animate forward: `.deck-card--peek1` → top position over 200ms

### ParticleBurst

Kept: triggered when top card is `secret_rare` or `ultra_rare` — fires on fly-off start (not on flip, since cards are face-up).

### Progress Counter

`{deckIndex + 1} / {cards.length}` — unchanged display.

### Summary Phase

Unchanged — existing grid view with staggered `card-reveal` animations.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/PackRip/PackRip.tsx` | Replace drag + deal state/handlers; new deck render |
| `src/components/PackRip/PackRip.css` | New flap/body/perf styles; deck stack styles; fly-off keyframe |

No new files. No other components touched.

---

## Out of Scope

- Replacing the pack image with a fully CSS-painted pack (deferred — uses existing `packImageUrl`)
- Sound effects
- Haptic feedback
- Mobile swipe-specific tweaks beyond pointer events

# Pack Opening Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace vertical pack split + click-to-flip card reveal with horizontal tear-at-top pack rip and face-up draggable card deck.

**Architecture:** Extract pure threshold logic into `packRipLogic.ts` for testability. Rewrite `PackRip.tsx` state + render — pack gets flap/body/perf layer structure driven by `--tear-pct` CSS custom property; card reveal becomes a pointer-draggable 3-card stack. All changes confined to `PackRip.tsx` + `PackRip.css` + new `packRipLogic.ts`.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Pointer Events API, `clip-path: inset()`, CSS `calc()` with custom properties.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/PackRip/packRipLogic.ts` | **Create** | Pure functions: `calcTearPct`, `shouldFlyOff` |
| `src/components/PackRip/packRipLogic.test.ts` | **Create** | Tests for above |
| `src/components/PackRip/PackRip.tsx` | **Modify** | State, handlers, render |
| `src/components/PackRip/PackRip.css` | **Modify** | Replace left/right styles; add flap/body/perf/deck |

---

## Task 1: Extract Pure Logic + Tests

**Files:**
- Create: `src/components/PackRip/packRipLogic.ts`
- Create: `src/components/PackRip/packRipLogic.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/PackRip/packRipLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcTearPct, shouldFlyOff } from './packRipLogic'

describe('calcTearPct', () => {
  it('returns 0 at no drag', () => {
    expect(calcTearPct(0, 80)).toBe(0)
  })
  it('returns 0.5 at half threshold', () => {
    expect(calcTearPct(40, 80)).toBe(0.5)
  })
  it('clamps to 1 beyond threshold', () => {
    expect(calcTearPct(100, 80)).toBe(1)
  })
  it('handles negative dx (drag left)', () => {
    expect(calcTearPct(-40, 80)).toBe(0.5)
  })
})

describe('shouldFlyOff', () => {
  it('triggers when distance meets threshold', () => {
    expect(shouldFlyOff(130, 130, 0, 0.6)).toBe(true)
  })
  it('does not trigger below distance and velocity', () => {
    expect(shouldFlyOff(100, 130, 0.3, 0.6)).toBe(false)
  })
  it('triggers on velocity alone', () => {
    expect(shouldFlyOff(50, 130, 0.6, 0.6)).toBe(true)
  })
  it('triggers above distance threshold regardless of velocity', () => {
    expect(shouldFlyOff(200, 130, 0, 0.6)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- packRipLogic
```

Expected: `Cannot find module './packRipLogic'`

- [ ] **Step 3: Create the logic module**

Create `src/components/PackRip/packRipLogic.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- packRipLogic
```

Expected: 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/PackRip/packRipLogic.ts src/components/PackRip/packRipLogic.test.ts
git commit -m "feat(pack): extract pure logic for tear/fly-off threshold calc"
```

---

## Task 2: Pack Structure — Flap/Body/Perf (JSX + Static CSS)

**Files:**
- Modify: `src/components/PackRip/PackRip.tsx:1`
- Modify: `src/components/PackRip/PackRip.css:35-50`

Replace the two `<img>` halves with three layers. This task makes the structure correct; progressive behavior comes in Task 3.

- [ ] **Step 1: Add import for packRipLogic in PackRip.tsx**

In `src/components/PackRip/PackRip.tsx`, add after the existing imports:

```ts
import { calcTearPct, shouldFlyOff } from './packRipLogic'
```

- [ ] **Step 2: Replace the pack render section in PackRip.tsx**

Find this block (lines 134–146):

```tsx
          <div
            ref={packRef}
            className={[
              'pack-rip__pack',
              phase === 'idle'    ? 'pack-rip__pack--idle'    : '',
              phase === 'grabbed' ? 'pack-rip__pack--grabbed' : '',
            ].join(' ').trim()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <img
              src={packImageUrl}
              alt="Pack"
              className={`pack-rip__left${phase === 'tearing' ? ' pack-rip__left--tearing' : ''}`}
            />
            <img
              src={packImageUrl}
              alt=""
              aria-hidden
              className={`pack-rip__right${phase === 'tearing' ? ' pack-rip__right--tearing' : ''}`}
            />
          </div>
```

Replace with:

```tsx
          <div
            ref={packRef}
            className={[
              'pack-rip__pack',
              phase === 'idle'    ? 'pack-rip__pack--idle'    : '',
              phase === 'grabbed' ? 'pack-rip__pack--grabbed' : '',
            ].join(' ').trim()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <div className="pack-rip__body">
              <img src={packImageUrl} alt="" aria-hidden />
            </div>
            <div className={`pack-rip__flap${phase === 'tearing' ? ' pack-rip__flap--tearing' : ''}`}>
              <img src={packImageUrl} alt="Pack" />
            </div>
            <div className="pack-rip__perf" aria-hidden>
              <svg width="100%" height="100%" viewBox="0 0 200 8" preserveAspectRatio="none">
                <line x1="8" y1="4" x2="90" y2="4" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeDasharray="5 3" />
                <line x1="110" y1="4" x2="192" y2="4" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeDasharray="5 3" />
                <polygon points="96,1 104,1 100,7" fill="rgba(255,255,255,0.95)" />
              </svg>
            </div>
          </div>
```

- [ ] **Step 3: Replace left/right CSS with flap/body/perf static styles**

In `src/components/PackRip/PackRip.css`, replace the entire section from `/* Left/right halves */` through `@keyframes shimmer-sweep { 100% ... }` (lines 35–76) with:

```css
/* ─── Flap (top 15%) + Body (bottom 85%) ───────────────── */
.pack-rip__flap,
.pack-rip__body {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.pack-rip__flap { clip-path: inset(0 0 85% 0); }
.pack-rip__body { clip-path: inset(15% 0 0 0); }

.pack-rip__flap img,
.pack-rip__body img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  filter: drop-shadow(0 0 24px var(--accent-glow));
  display: block;
}

.pack-rip__flap {
  transform: translateY(calc(var(--tear-pct, 0) * -10px))
             rotate(calc(var(--tear-pct, 0) * -3deg));
  transform-origin: center bottom;
  will-change: transform;
}

.pack-rip__pack--idle .pack-rip__flap {
  transition: transform 0.3s ease-out;
}

/* ─── Perforations overlay ──────────────────────────────── */
.pack-rip__perf {
  position: absolute;
  top: calc(15% - 4px);
  left: 0;
  width: 100%;
  height: 8px;
  pointer-events: none;
  z-index: 3;
  opacity: calc(0.3 + var(--tear-pct, 0) * 0.7);
}

/* ─── Shimmer sweep ─────────────────────────────────────── */
.pack-rip__pack::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.22) 50%, transparent 65%);
  transform: translateX(-150%);
  animation: shimmer-sweep 4s linear infinite;
  pointer-events: none;
  z-index: 2;
}

@keyframes shimmer-sweep {
  0%   { transform: translateX(-150%); }
  100% { transform: translateX(200%); }
}
```

- [ ] **Step 4: Remove old grabbed left/right rules (lines 52–58 in original)**

Delete these lines from `PackRip.css`:

```css
.pack-rip__pack--grabbed .pack-rip__left  { transform: translateX(calc(-1 * var(--tear-dx, 0px))); }
.pack-rip__pack--grabbed .pack-rip__right { transform: translateX(var(--tear-dx, 0px)); }
```

- [ ] **Step 5: Verify pack renders with horizontal split**

```bash
npm run dev
```

Open `http://localhost:5173`, navigate to pack opening. Pack should show image with a visible perforated line ~15% from top. Dragging should still trigger the old tear animation (left/right pieces — will be fixed in Task 4). No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/PackRip/PackRip.tsx src/components/PackRip/PackRip.css
git commit -m "feat(pack): replace vertical split with flap/body/perf layer structure"
```

---

## Task 3: Pack Drag — Switch to `--tear-pct`

**Files:**
- Modify: `src/components/PackRip/PackRip.tsx:46-72`

Update handlers to drive `--tear-pct` (0–1) instead of `--tear-dx` (px). Import `calcTearPct` already added in Task 2.

- [ ] **Step 1: Update handlePointerMove**

Find in `PackRip.tsx`:

```ts
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'grabbed') return
    const dx = Math.abs(e.clientX - grabXRef.current)
    packRef.current?.style.setProperty('--tear-dx', `${dx / 2}px`)
  }
```

Replace with:

```ts
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'grabbed') return
    const dx = e.clientX - grabXRef.current
    const pct = calcTearPct(dx, TEAR_THRESHOLD)
    packRef.current?.style.setProperty('--tear-pct', String(pct))
  }
```

- [ ] **Step 2: Update handlePointerUp to use shouldFlyOff**

Find:

```ts
  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'grabbed') return
    const dx  = Math.abs(e.clientX - grabXRef.current)
    const dt  = performance.now() - grabTimeRef.current
    const vel = dt > 0 ? dx / dt : 0

    if (dx >= TEAR_THRESHOLD || vel >= TEAR_VELOCITY) {
      doTear()
    } else {
      snapBack()
    }
  }
```

Replace with:

```ts
  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'grabbed') return
    const dx  = Math.abs(e.clientX - grabXRef.current)
    const dt  = performance.now() - grabTimeRef.current
    const vel = dt > 0 ? dx / dt : 0

    if (shouldFlyOff(dx, TEAR_THRESHOLD, vel, TEAR_VELOCITY)) {
      doTear()
    } else {
      snapBack()
    }
  }
```

- [ ] **Step 3: Update snapBack to reset --tear-pct**

Find:

```ts
  function snapBack() {
    packRef.current?.style.setProperty('--tear-dx', '0px')
    setPhase('idle')
  }
```

Replace with:

```ts
  function snapBack() {
    packRef.current?.style.setProperty('--tear-pct', '0')
    setPhase('idle')
  }
```

- [ ] **Step 4: Verify progressive tear**

```bash
npm run dev
```

Drag pack slowly. Perforations should fade in and flap should lift as you drag. Release early → flap snaps back smoothly. Console: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/PackRip/PackRip.tsx
git commit -m "feat(pack): drive tear animation via --tear-pct (0-1)"
```

---

## Task 4: Flap Fly-Off (Replace Old Tear Keyframes)

**Files:**
- Modify: `src/components/PackRip/PackRip.css:79-90`

Replace `tear-left`/`tear-right` keyframes and their classes with a single `flap-fly-off` that sends the top flap upward.

- [ ] **Step 1: Remove `overflow: hidden` from `.pack-rip__pack`**

In `PackRip.css`, find:

```css
.pack-rip__pack {
  position: relative;
  width: 200px;
  height: 280px;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  touch-action: none;
  overflow: hidden;
}
```

Remove the `overflow: hidden;` line (the flap must escape the container during fly-off). The shimmer pseudo-element is already clipped to the image area via its `transform` range.

- [ ] **Step 2: Replace tear keyframes in PackRip.css**

Find and delete this entire section:

```css
/* ─── Tear animation ────────────────────────────────────── */
@keyframes tear-left {
  0%   { transform: translateX(0) rotate(0deg); opacity: 1; }
  100% { transform: translateX(-200vw) rotate(-15deg); opacity: 0; }
}

@keyframes tear-right {
  0%   { transform: translateX(0) rotate(0deg); opacity: 1; }
  100% { transform: translateX(200vw) rotate(15deg); opacity: 0; }
}

.pack-rip__left--tearing  { animation: tear-left  0.4s ease-in forwards; }
.pack-rip__right--tearing { animation: tear-right 0.4s ease-in forwards; }
```

Replace with:

```css
/* ─── Flap fly-off ──────────────────────────────────────── */
@keyframes flap-fly-off {
  0%   { transform: translateY(-10px) rotate(-3deg); opacity: 1; }
  100% { transform: translateY(-120vh) rotate(-15deg); opacity: 0; }
}

.pack-rip__flap--tearing {
  animation: flap-fly-off 0.4s ease-in forwards;
}
```

- [ ] **Step 3: Verify tear animation**

```bash
npm run dev
```

Drag past threshold. Flap should fly upward off screen. Body (bottom) stays. After ~450ms cards deal. No orphaned animations.

- [ ] **Step 4: Commit**

```bash
git add src/components/PackRip/PackRip.css
git commit -m "feat(pack): flap flies upward on tear, remove horizontal split animation"
```

---

## Task 5: Deck State + JSX

**Files:**
- Modify: `src/components/PackRip/PackRip.tsx`

Replace `dealIndex`/`flipped` state and the entire dealing phase render with deck state + 3-card stack render. Add `FLY_THRESHOLD`/`FLY_VELOCITY` constants. Card handlers come in Task 6.

- [ ] **Step 1: Update constants at top of PackRip.tsx**

Find:

```ts
const TEAR_THRESHOLD = 80   // px horizontal drag to trigger tear
const TEAR_VELOCITY  = 0.5  // px/ms — fast flick also triggers
```

Replace with:

```ts
const TEAR_THRESHOLD = 80
const TEAR_VELOCITY  = 0.5
const FLY_THRESHOLD  = 130
const FLY_VELOCITY   = 0.6
```

- [ ] **Step 2: Replace state declarations**

Find:

```ts
  const [phase, setPhase] = useState<Phase>('idle')
  const [dealIndex, setDealIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null)
```

Replace with:

```ts
  const [phase, setPhase] = useState<Phase>('idle')
  const [deckIndex, setDeckIndex] = useState(0)
  const [dragState, setDragState] = useState<{ dx: number; dy: number } | null>(null)
  const [flying, setFlying] = useState<{ dx: number; dy: number } | null>(null)
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null)
```

- [ ] **Step 3: Replace refs**

Find:

```ts
  const packRef      = useRef<HTMLDivElement>(null)
  const grabXRef     = useRef(0)
  const grabTimeRef  = useRef(0)
  const cardDealRef  = useRef<HTMLDivElement>(null)
  const mountedRef   = useRef(true)
```

Replace with:

```ts
  const packRef      = useRef<HTMLDivElement>(null)
  const grabXRef     = useRef(0)
  const grabTimeRef  = useRef(0)
  const topCardRef   = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const mountedRef   = useRef(true)
```

- [ ] **Step 4: Update doTear to reset deck state**

Find:

```ts
  function doTear() {
    setPhase('tearing')
    setTimeout(() => {
      if (!mountedRef.current) return
      setPhase('discarded')
      setDealIndex(0)
      setFlipped(false)
      setTimeout(() => {
        if (!mountedRef.current) return
        setPhase('dealing')
      }, 100)
    }, 450)
  }
```

Replace with:

```ts
  function doTear() {
    setPhase('tearing')
    setTimeout(() => {
      if (!mountedRef.current) return
      setPhase('discarded')
      setDeckIndex(0)
      setDragState(null)
      setFlying(null)
      setTimeout(() => {
        if (!mountedRef.current) return
        setPhase('dealing')
      }, 100)
    }, 450)
  }
```

- [ ] **Step 5: Remove handleDealClick and currentCard**

Delete the entire `handleDealClick` function (lines 89–113) and the `const currentCard = cards[dealIndex]` line.

- [ ] **Step 6: Add drag distance helper before the return**

Add after doTear and before the return statement:

```ts
  const dragDistance = dragState
    ? Math.sqrt(dragState.dx ** 2 + dragState.dy ** 2)
    : 0
  const isCommitting = dragDistance > FLY_THRESHOLD * 0.75
```

- [ ] **Step 7: Replace the dealing phase render**

Find and replace the entire dealing phase block:

```tsx
      {/* ── Deal phase — one card at a time ── */}
      {phase === 'dealing' && currentCard && (
        <div className="pack-rip__deal" onClick={handleDealClick}>
          <p className="pack-rip__progress">{dealIndex + 1} / {cards.length}</p>
          <div
            key={`deal-${dealIndex}`}
            ref={cardDealRef}
            className="pack-rip__deal-card card-flip"
          >
            <div className={`card-flip__inner${flipped ? ' card-flip__inner--flipped' : ''}`}>
              <div className="card-flip__front card-back">✦</div>
              <div className="card-flip__back">
                <HoloCard card={currentCard} size="sm" />
              </div>
            </div>
          </div>
          <p className="pack-rip__hint">
            {flipped
              ? dealIndex + 1 < cards.length ? 'Tap for next →' : 'Tap to see all'
              : 'Tap to reveal'}
          </p>
        </div>
      )}
```

Replace with:

```tsx
      {/* ── Dealing phase — draggable card deck ── */}
      {phase === 'dealing' && cards[deckIndex] && (
        <div className="pack-rip__deck">
          <p className="pack-rip__progress">{deckIndex + 1} / {cards.length}</p>
          <div className="pack-rip__deck-stack">
            {[2, 1].map(offset => {
              const idx = deckIndex + offset
              return (
                <div key={`peek-${offset}`} className={`deck-card deck-card--peek${offset}`}>
                  {idx < cards.length
                    ? <HoloCard card={cards[idx]} size="sm" />
                    : <div className="card-back">✦</div>
                  }
                </div>
              )
            })}
            <div
              key={`deck-${deckIndex}`}
              ref={topCardRef}
              className={[
                'deck-card',
                'deck-card--top',
                flying       ? 'deck-card--flying'     : '',
                isCommitting ? 'deck-card--committing' : '',
              ].join(' ').trim()}
              style={flying
                ? {
                    transform: `translate(${flying.dx}px, ${flying.dy}px) rotate(${Math.max(-20, Math.min(20, flying.dx / 8))}deg)`,
                    opacity: 0,
                  }
                : dragState
                  ? {
                      transform: `translate(${dragState.dx}px, ${dragState.dy}px) rotate(${Math.max(-20, Math.min(20, dragState.dx / 8))}deg)`,
                    }
                  : undefined
              }
              onPointerDown={handleCardPointerDown}
              onPointerMove={handleCardPointerMove}
              onPointerUp={handleCardPointerUp}
              onPointerCancel={handleCardPointerCancel}
            >
              <HoloCard card={cards[deckIndex]} size="sm" />
            </div>
          </div>
          <p className="pack-rip__hint">Drag to reveal next</p>
        </div>
      )}
```

Note: `handleCardPointerDown/Move/Up/Cancel` are stubs at this point — add them as empty functions temporarily so TypeScript compiles:

```ts
  function handleCardPointerDown(_e: React.PointerEvent<HTMLDivElement>) {}
  function handleCardPointerMove(_e: React.PointerEvent<HTMLDivElement>) {}
  function handleCardPointerUp(_e: React.PointerEvent<HTMLDivElement>) {}
  function handleCardPointerCancel() {}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: build succeeds (or only pre-existing warnings). The dealing phase now shows a static stack of 3 face-up cards.

- [ ] **Step 9: Commit**

```bash
git add src/components/PackRip/PackRip.tsx
git commit -m "feat(pack): deck state + 3-card stack render (handlers stubbed)"
```

---

## Task 6: Deck CSS Stack

**Files:**
- Modify: `src/components/PackRip/PackRip.css`

Add all deck visual styles. Replace the old `pack-rip__deal` + `card-flip` sections.

- [ ] **Step 1: Replace deal + card-flip CSS sections**

Find and delete the sections:

```css
/* ─── Deal phase — single card center ───────────────────── */
.pack-rip__deal { ... }
.pack-rip__deal-card { ... }
@keyframes deal-enter { ... }
.pack-rip__progress { ... }
```

And:

```css
/* ─── Card flip ─────────────────────────────────────────── */
.card-flip { ... }
.card-flip__inner { ... }
.card-flip__inner--flipped { ... }
.card-flip__front,
.card-flip__back { ... }
.card-flip__back { ... }
.card-back { ... }
```

Replace all of that with:

```css
/* ─── Card deck ─────────────────────────────────────────── */
.pack-rip__deck {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.pack-rip__deck-stack {
  position: relative;
  width: 120px;
  height: 167px;
}

.deck-card {
  position: absolute;
  inset: 0;
}

.deck-card--peek2 {
  transform: translateY(8px) scale(0.94);
  z-index: 1;
}

.deck-card--peek1 {
  transform: translateY(4px) scale(0.97);
  z-index: 2;
}

.deck-card--top {
  z-index: 3;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.deck-card--top:active {
  cursor: grabbing;
}

.deck-card--flying {
  transition: transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              opacity 0.32s ease-in;
  pointer-events: none;
}

.deck-card--committing {
  filter: drop-shadow(0 0 14px rgba(255, 200, 50, 0.65));
}

/* ─── Progress ──────────────────────────────────────────── */
.pack-rip__progress {
  color: var(--text-muted);
  font-family: monospace;
  font-size: 0.9rem;
  letter-spacing: 0.05em;
}

/* ─── Card back (placeholder for empty deck slots) ──────── */
.card-back {
  width: 120px;
  height: 167px;
  background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
  border-radius: 4.75% / 3.5%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}
```

- [ ] **Step 2: Verify deck looks correct**

```bash
npm run dev
```

After tearing open a pack, dealing phase should show a stack of 3 cards offset slightly, with depth illusion. Top card is interactive (grab cursor). Dragging does nothing yet (stubs).

- [ ] **Step 3: Commit**

```bash
git add src/components/PackRip/PackRip.css
git commit -m "feat(pack): deck stack CSS — peek layers, fly-off transition, commit glow"
```

---

## Task 7: Card Drag Handlers + Fly-Off

**Files:**
- Modify: `src/components/PackRip/PackRip.tsx`

Replace the four stub handlers with real implementations. Add `flyCard` function.

- [ ] **Step 1: Replace stub handlers with real implementations**

Find and replace the four stub handler functions:

```ts
  function handleCardPointerDown(_e: React.PointerEvent<HTMLDivElement>) {}
  function handleCardPointerMove(_e: React.PointerEvent<HTMLDivElement>) {}
  function handleCardPointerUp(_e: React.PointerEvent<HTMLDivElement>) {}
  function handleCardPointerCancel() {}
```

Replace with:

```ts
  function handleCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'dealing' || flying) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartRef.current = { x: e.clientX, y: e.clientY, time: performance.now() }
  }

  function handleCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current || flying) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setDragState({ dx, dy })
  }

  function handleCardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const dt = performance.now() - dragStartRef.current.time
    const velocity = dt > 0 ? distance / dt : 0
    dragStartRef.current = null

    if (shouldFlyOff(distance, FLY_THRESHOLD, velocity, FLY_VELOCITY)) {
      flyCard(dx, dy)
    } else {
      setDragState(null)
    }
  }

  function handleCardPointerCancel() {
    dragStartRef.current = null
    setDragState(null)
  }

  function flyCard(dx: number, dy: number) {
    const card = cards[deckIndex]
    if (card && (card.rarity === 'secret_rare' || card.rarity === 'ultra_rare')) {
      const el = topCardRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        setBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        setTimeout(() => setBurst(null), 1500)
      }
    }

    setDragState(null)
    setFlying({ dx: dx * 6, dy: dy * 6 })

    setTimeout(() => {
      if (!mountedRef.current) return
      const next = deckIndex + 1
      if (next >= cards.length) {
        setPhase('summary')
      } else {
        setDeckIndex(next)
        setFlying(null)
      }
    }, 320)
  }
```

- [ ] **Step 2: Run full test suite**

```bash
npm run test
```

Expected: all tests pass (packRipLogic tests + any pre-existing tests)

- [ ] **Step 3: Verify full flow in browser**

```bash
npm run dev
```

Test the complete flow:
1. Pack idle — perforations visible at low opacity, breathe animation
2. Drag pack — flap lifts, perforations brighten progressively
3. Release early — flap snaps back
4. Drag past threshold — flap flies upward
5. Deck appears — 3 face-up cards stacked
6. Drag top card slowly — card follows pointer, rotates with drag direction
7. Drag >75% of 130px — card glows gold (commit cue)
8. Release at full threshold — card flies off in drag direction, next card becomes top
9. Last card flies off → summary grid
10. For a `secret_rare` or `ultra_rare` — particle burst fires on fly-off

- [ ] **Step 4: Commit**

```bash
git add src/components/PackRip/PackRip.tsx
git commit -m "feat(pack): card drag + fly-off deck interaction, particle burst on rare"
```

---

## Task 8: Final Cleanup

**Files:**
- Modify: `src/components/PackRip/PackRip.css`

- [ ] **Step 1: Verify no leftover CSS references**

Check for any remaining references to removed classes:

```bash
grep -n "tear-left\|tear-right\|pack-rip__left\|pack-rip__right\|deal-enter\|pack-rip__deal\b\|card-flip" src/components/PackRip/PackRip.css
```

Expected: no output. If any found, delete those lines.

- [ ] **Step 2: Run full test suite one final time**

```bash
npm run test
```

Expected: all tests pass

- [ ] **Step 3: Final build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: build completes with no errors

- [ ] **Step 4: Final commit**

```bash
git add src/components/PackRip/PackRip.css
git commit -m "chore(pack): remove leftover CSS for old split animation"
```

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 | `packRipLogic.ts` + tests: `calcTearPct`, `shouldFlyOff` |
| 2 | Pack image split → flap/body/perf layers (JSX + CSS) |
| 3 | `--tear-pct` drives progressive tear |
| 4 | Flap flies upward on tear |
| 5 | Deck state + 3-card stack render |
| 6 | Deck CSS: peek depth, fly-off transition, commit glow |
| 7 | Card drag handlers + fly-off + particle burst |
| 8 | Cleanup + final verify |

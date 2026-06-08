# UX Animations & Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance pack opening (horizontal drag-to-rip + one-at-a-time card deal), replace HTML5 drag with pointer-driven card dragging, add shop carousel, and add 3D book-flip binder pagination.

**Architecture:** Pure CSS animations + pointer events — zero new dependencies. Pack opening rewrites PackRip state machine to `idle→grabbed→tearing→discarded→dealing→summary`. Drag-and-drop moves to a `useDrag` hook using pointer events + a DOM clone. Shop uses CSS scroll-snap + IntersectionObserver. Binder page turn uses CSS 3D `rotateY` with mid-flip content swap.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Pointer Events API, IntersectionObserver

---

## File Map

| File | Change |
|------|--------|
| `src/components/PackRip/PackRip.tsx` | Full rewrite — new state machine, pointer drag, deal phase |
| `src/components/PackRip/PackRip.css` | New keyframes: breathing, shimmer, vertical tear, summary fan |
| `src/hooks/useDrag.ts` | New — pointer-based drag hook with DOM clone |
| `src/routes/Collection.tsx` | Replace HTML5 drag with useDrag; update BinderPanel props |
| `src/components/BinderPanel/BinderPanel.tsx` | Update drag props; add 3D page flip |
| `src/components/BinderPanel/BinderPanel.css` | Drop zone highlights; book-flip keyframes |
| `src/routes/Shop.tsx` | Carousel layout + IntersectionObserver |
| `src/routes/Shop.css` | New — carousel styles |

---

## Task 1: Pack CSS — breathing idle + continuous shimmer + vertical split clips

**Files:**
- Modify: `src/components/PackRip/PackRip.css`

- [ ] **Step 1: Replace existing pack CSS with updated version**

Replace the entire contents of `src/components/PackRip/PackRip.css` with:

```css
/* ─── Page wrapper ─────────────────────────────────────── */
.pack-rip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 2rem;
  padding: 2rem 1rem;
  background: var(--bg);
  overflow-x: hidden;
}

/* ─── Pack image wrapper ────────────────────────────────── */
.pack-rip__pack {
  position: relative;
  width: 200px;
  height: 280px;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  touch-action: none;
}

.pack-rip__pack--idle {
  animation: pack-breathe 3s ease-in-out infinite;
}

@keyframes pack-breathe {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.02); }
}

/* Left/right halves */
.pack-rip__left,
.pack-rip__right {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  filter: drop-shadow(0 0 24px var(--accent-glow));
  will-change: transform;
}

.pack-rip__left  { clip-path: polygon(0 0, 50% 0, 50% 100%, 0 100%); }
.pack-rip__right { clip-path: polygon(50% 0, 100% 0, 100% 100%, 50% 100%); }

/* Drag: halves move apart via CSS custom property */
.pack-rip__pack--grabbed .pack-rip__left  { transform: translateX(calc(-1 * var(--tear-dx, 0px))); }
.pack-rip__pack--grabbed .pack-rip__right { transform: translateX(var(--tear-dx, 0px)); }

/* Continuous shimmer sweep */
.pack-rip__pack::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%);
  background-size: 200% 200%;
  animation: shimmer-sweep 4s linear infinite;
  pointer-events: none;
}

@keyframes shimmer-sweep {
  0%   { background-position: -100% -100%; }
  100% { background-position: 200% 200%; }
}

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

/* ─── Deal phase — single card center ───────────────────── */
.pack-rip__deal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.pack-rip__deal-card {
  animation: deal-enter 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes deal-enter {
  0%   { opacity: 0; transform: translateY(40px) scale(0.85); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.pack-rip__progress {
  color: var(--text-muted);
  font-family: monospace;
  font-size: 0.9rem;
  letter-spacing: 0.05em;
}

/* ─── Summary fan grid ──────────────────────────────────── */
.pack-rip__summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.5rem;
  max-width: min(960px, 100%);
  width: 100%;
}

.pack-rip__card-slot {
  animation: card-reveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  opacity: 0;
}

@keyframes card-reveal {
  0%   { opacity: 0; transform: translateY(50px) scale(0.7) rotateX(45deg); }
  60%  { transform: translateY(-8px) scale(1.05) rotateX(0deg); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0deg); }
}

@keyframes card-reveal-rare {
  0%   { opacity: 0; transform: translateY(50px) scale(0.5) rotateX(45deg); filter: drop-shadow(0 0 0px rgba(255,215,0,0)); }
  50%  { transform: translateY(-15px) scale(1.1) rotateX(0deg); filter: drop-shadow(0 0 20px rgba(255,215,0,0.9)); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0deg); filter: drop-shadow(0 0 6px rgba(255,215,0,0.3)); }
}

.pack-rip__card-slot--rare {
  animation: card-reveal-rare 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
}

/* ─── Card flip ─────────────────────────────────────────── */
.card-flip {
  perspective: 800px;
  cursor: pointer;
  width: 120px;
  height: 167px;
}

.card-flip__inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.card-flip__inner--flipped { transform: rotateY(180deg); }

.card-flip__front,
.card-flip__back {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.card-flip__back {
  transform: rotateY(180deg);
  display: flex;
  align-items: center;
  justify-content: center;
}

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

/* ─── Hint text ─────────────────────────────────────────── */
.pack-rip__hint {
  color: var(--text-muted);
  font-size: 0.9rem;
  text-align: center;
  animation: hint-pulse 2s ease-in-out infinite;
  user-select: none;
}

@keyframes hint-pulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 0.9; }
}

/* ─── Actions ───────────────────────────────────────────── */
.pack-rip__actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}
```

- [ ] **Step 2: Verify no CSS errors**

```bash
npm run build 2>&1 | head -30
```

Expected: no CSS parse errors (TypeScript errors for missing JSX props are OK at this stage).

- [ ] **Step 3: Commit**

```bash
git add src/components/PackRip/PackRip.css
git commit -m "feat: pack CSS — breathing idle, shimmer, vertical split, deal/summary animations"
```

---

## Task 2: PackRip.tsx — horizontal drag-to-rip + state machine

**Files:**
- Modify: `src/components/PackRip/PackRip.tsx`

- [ ] **Step 1: Rewrite PackRip.tsx**

Replace the entire file:

```tsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Card } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import ParticleBurst from '../ParticleBurst/ParticleBurst'
import './PackRip.css'

type Phase = 'idle' | 'grabbed' | 'tearing' | 'discarded' | 'dealing' | 'summary'

type Props = {
  packImageUrl: string
  cards: Card[]
  onComplete: () => void
}

const TEAR_THRESHOLD = 80   // px horizontal drag to trigger tear
const TEAR_VELOCITY  = 0.5  // px/ms — fast flick also triggers

export default function PackRip({ packImageUrl, cards, onComplete }: Props) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [dealIndex, setDealIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null)

  const packRef      = useRef<HTMLDivElement>(null)
  const grabXRef     = useRef(0)
  const grabTimeRef  = useRef(0)
  const cardDealRef  = useRef<HTMLDivElement>(null)

  // ── Drag handlers ──────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'idle') return
    e.currentTarget.setPointerCapture(e.pointerId)
    grabXRef.current   = e.clientX
    grabTimeRef.current = performance.now()
    setPhase('grabbed')
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== 'grabbed') return
    const dx = Math.abs(e.clientX - grabXRef.current)
    packRef.current?.style.setProperty('--tear-dx', `${dx / 2}px`)
  }

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

  function handlePointerCancel() {
    if (phase === 'grabbed') snapBack()
  }

  function snapBack() {
    packRef.current?.style.setProperty('--tear-dx', '0px')
    setPhase('idle')
  }

  function doTear() {
    setPhase('tearing')
    setTimeout(() => {
      setPhase('discarded')
      setDealIndex(0)
      setFlipped(false)
      setTimeout(() => setPhase('dealing'), 100)
    }, 450)
  }

  // ── Deal handlers ──────────────────────────────────────
  function handleDealClick() {
    if (phase !== 'dealing') return
    if (!flipped) {
      // Flip current card face-up
      setFlipped(true)
      const card = cards[dealIndex]
      if (card && (card.rarity === 'secret_rare' || card.rarity === 'ultra_rare')) {
        const el = cardDealRef.current
        if (el) {
          const rect = el.getBoundingClientRect()
          setBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          setTimeout(() => setBurst(null), 1500)
        }
      }
    } else {
      // Advance to next card or summary
      const next = dealIndex + 1
      if (next >= cards.length) {
        setPhase('summary')
      } else {
        setDealIndex(next)
        setFlipped(false)
      }
    }
  }

  const currentCard = cards[dealIndex]

  return (
    <div className="pack-rip">

      {/* ── Pack (idle / grabbed / tearing) ── */}
      {(phase === 'idle' || phase === 'grabbed' || phase === 'tearing') && (
        <>
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
          {phase === 'idle' && (
            <p className="pack-rip__hint">Drag to rip open</p>
          )}
        </>
      )}

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

      {/* ── Summary — all cards ── */}
      {phase === 'summary' && (
        <>
          <div className="pack-rip__summary">
            {cards.map((card, i) => (
              <div
                key={card.id + i}
                className={[
                  'pack-rip__card-slot',
                  card.rarity === 'secret_rare' || card.rarity === 'ultra_rare'
                    ? 'pack-rip__card-slot--rare'
                    : '',
                ].join(' ').trim()}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <HoloCard card={card} size="sm" />
              </div>
            ))}
          </div>
          <div className="pack-rip__actions">
            <button className="btn btn--secondary" onClick={() => navigate('/shop')}>
              ← Back to Shop
            </button>
            <button className="btn btn--primary" onClick={onComplete}>
              Add to Collection
            </button>
          </div>
        </>
      )}

      {burst && <ParticleBurst x={burst.x} y={burst.y} active={true} />}
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test -- --reporter=verbose 2>&1 | tail -20
```

Expected: existing tests pass (HoloCard tests unrelated to PackRip).

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/PackRip/PackRip.tsx
git commit -m "feat: pack opening — horizontal drag-to-rip, one-at-a-time deal, summary view"
```

---

## Task 3: useDrag hook — pointer-based drag with DOM clone

**Files:**
- Create: `src/hooks/useDrag.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/useDrag.ts
import { useState, useRef } from 'react'

export type DropHandler = (entryId: string, zoneId: string) => void

export function useDrag(onDrop: DropHandler) {
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null)

  // All mutable drag state in one ref to avoid stale closures in event listeners
  const dragRef = useRef<{
    clone:    HTMLImageElement | null
    originEl: HTMLElement | null
    entryId:  string | null
    offsetX:  number
    offsetY:  number
    onDrop:   DropHandler
    moveHandler: ((e: PointerEvent) => void) | null
    upHandler:   ((e: PointerEvent) => void) | null
  }>({
    clone: null, originEl: null, entryId: null,
    offsetX: 0, offsetY: 0, onDrop,
    moveHandler: null, upHandler: null,
  })

  // Keep onDrop current without re-creating handlers
  dragRef.current.onDrop = onDrop

  function startDrag(entryId: string, imageUrl: string, el: HTMLElement) {
    const d = dragRef.current
    d.entryId  = entryId
    d.originEl = el
    el.style.opacity = '0.3'

    const rect    = el.getBoundingClientRect()
    d.offsetX = rect.width  / 2
    d.offsetY = rect.height / 2

    const clone = document.createElement('img')
    clone.src = imageUrl
    Object.assign(clone.style, {
      position:      'fixed',
      width:         `${rect.width}px`,
      height:        `${rect.height}px`,
      left:          `${rect.left}px`,
      top:           `${rect.top}px`,
      pointerEvents: 'none',
      borderRadius:  '4.75% / 3.5%',
      boxShadow:     '0 8px 32px rgba(0,0,0,0.6)',
      zIndex:        '999',
      transition:    'transform 0.05s',
    })
    document.body.appendChild(clone)
    d.clone = clone
    setDraggedEntryId(entryId)

    d.moveHandler = (e: PointerEvent) => {
      if (!d.clone) return
      d.clone.style.left      = `${e.clientX - d.offsetX}px`
      d.clone.style.top       = `${e.clientY - d.offsetY}px`
      const rot = Math.max(-8, Math.min(8, e.movementX * 0.4))
      d.clone.style.transform = `rotate(${rot}deg)`
    }

    d.upHandler = (e: PointerEvent) => {
      const { entryId: id, onDrop: drop } = d
      if (id) {
        const els    = document.elementsFromPoint(e.clientX, e.clientY)
        const zoneEl = els.find(el => el.hasAttribute('data-drop-zone'))
        const zoneId = zoneEl?.getAttribute('data-drop-zone') ?? null
        if (zoneId) drop(id, zoneId)
      }
      cleanup()
    }

    document.addEventListener('pointermove', d.moveHandler)
    document.addEventListener('pointerup',   d.upHandler)
  }

  function cleanup() {
    const d = dragRef.current
    d.clone?.remove()
    d.clone = null
    if (d.originEl) d.originEl.style.opacity = ''
    d.originEl = null
    d.entryId  = null
    if (d.moveHandler) document.removeEventListener('pointermove', d.moveHandler)
    if (d.upHandler)   document.removeEventListener('pointerup',   d.upHandler)
    d.moveHandler = null
    d.upHandler   = null
    setDraggedEntryId(null)
  }

  return { draggedEntryId, startDrag }
}
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDrag.ts
git commit -m "feat: useDrag hook — pointer-based card drag with DOM clone"
```

---

## Task 4: Collection — replace HTML5 drag with useDrag

**Files:**
- Modify: `src/routes/Collection.tsx`
- Modify: `src/components/BinderPanel/BinderPanel.tsx`

This task removes all `draggable`/`onDragStart`/`onDragEnd`/`onDragOver`/`onDrop` HTML5 drag attributes and replaces them with the `useDrag` hook.

- [ ] **Step 1: Update Collection.tsx**

In `src/routes/Collection.tsx`:

1. Add import at top:
```tsx
import { useDrag } from '../hooks/useDrag'
```

2. Remove the existing `draggedEntryId` and `isGridDragOver` state declarations:
```tsx
// REMOVE these two lines:
const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null)
const [isGridDragOver, setIsGridDragOver] = useState(false)
```

3. Add after the `handleMoveCard` function (before the drag handlers section):
```tsx
function handleDrop(entryId: string, zoneId: string) {
  if (zoneId === 'bulk') {
    const entry = collection.find(e => e.id === entryId)
    if (entry && entry.binder_id !== null) handleMoveCard(entryId, null)
  } else if (zoneId.startsWith('binder-')) {
    const binderId = zoneId.slice(7)
    handleMoveCard(entryId, binderId)
  }
}

const { draggedEntryId, startDrag } = useDrag(handleDrop)
```

4. Remove the `handleBulkDrop` function entirely:
```tsx
// REMOVE this entire function:
function handleBulkDrop(e: React.DragEvent) { ... }
```

5. Update the bulk grid `<div>`:
```tsx
// REPLACE:
<div
  className={`collection__grid${isGridDragOver ? ' collection__grid--droptarget' : ''}`}
  onDragOver={e => { e.preventDefault(); setIsGridDragOver(true) }}
  onDragLeave={() => setIsGridDragOver(false)}
  onDrop={handleBulkDrop}
>
// WITH:
<div
  className="collection__grid"
  data-drop-zone="bulk"
>
```

6. Update each card slot in the bulk grid:
```tsx
// REPLACE the <div key={entry.id} ...> for each card slot:
<div
  key={entry.id}
  className={`collection__slot${editMode ? ' collection__slot--edit' : ''}${draggedEntryId === entry.id ? ' collection__slot--dragging' : ''}`}
  onPointerDown={e => {
    if (!editMode && panelOpen)
      startDrag(entry.id, entry.card.image_url, e.currentTarget)
  }}
  onClick={() => {
    if (editMode) openStepper(entry)
    else setSelected(entry)
  }}
>
```

7. Update the BinderPanel props (remove `onDragStart`, pass `startDrag` instead and rename prop):
```tsx
// REPLACE:
<BinderPanel
  binders={binders}
  collection={collection}
  draggedEntryId={draggedEntryId}
  onDragStart={setDraggedEntryId}
  onMoveCard={handleMoveCard}
  onCreateBinder={handleCreateBinder}
  onDeleteBinder={handleDeleteBinder}
/>
// WITH:
<BinderPanel
  binders={binders}
  collection={collection}
  draggedEntryId={draggedEntryId}
  onStartDrag={startDrag}
  onMoveCard={handleMoveCard}
  onCreateBinder={handleCreateBinder}
  onDeleteBinder={handleDeleteBinder}
/>
```

- [ ] **Step 2: Update BinderPanel.tsx**

In `src/components/BinderPanel/BinderPanel.tsx`:

1. Update the Props type — replace `onDragStart` with `onStartDrag`:
```tsx
type Props = {
  binders: Binder[]
  collection: CollectionEntry[]
  draggedEntryId: string | null
  onStartDrag: (entryId: string, imageUrl: string, el: HTMLElement) => void
  onMoveCard: (entryId: string, binderId: string | null) => void
  onCreateBinder: (name: string, color: string) => Promise<void>
  onDeleteBinder: (binderId: string) => Promise<void>
}
```

2. Destructure `onStartDrag` instead of `onDragStart`:
```tsx
export default function BinderPanel({
  binders,
  collection,
  draggedEntryId,
  onStartDrag,
  onMoveCard,
  onCreateBinder,
  onDeleteBinder,
}: Props) {
```

3. Remove the `isDragOver` state and the `handleDrop` function.

4. Remove `onDragOver`, `onDragLeave`, `onDrop` from the binder view `<div>`. Replace the outer binder-view div:
```tsx
// REPLACE:
<div
  className={`binder-panel${isDragOver ? ' binder-panel--drag-over' : ''}`}
  onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
  onDragLeave={() => setIsDragOver(false)}
  onDrop={handleDrop}
>
// WITH:
<div
  className="binder-panel"
  data-drop-zone={`binder-${binder.id}`}
>
```

5. Update card slots in binder grid — replace `draggable` + `onDragStart` with `onPointerDown`:
```tsx
// REPLACE:
<div
  key={entry.id}
  className="binder-panel__slot"
  draggable
  onDragStart={() => onDragStart(entry.id)}
>
// WITH:
<div
  key={entry.id}
  className="binder-panel__slot"
  onPointerDown={e =>
    onStartDrag(entry.id, entry.card.image_url, e.currentTarget)
  }
>
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Collection.tsx src/components/BinderPanel/BinderPanel.tsx
git commit -m "feat: replace HTML5 drag with pointer-events useDrag in Collection and BinderPanel"
```

---

## Task 5: Drop zone highlight CSS

**Files:**
- Modify: `src/components/BinderPanel/BinderPanel.css`

- [ ] **Step 1: Read the current file**

Read `src/components/BinderPanel/BinderPanel.css` to find the end of the file.

- [ ] **Step 2: Append drop zone styles**

Add at the end of `src/components/BinderPanel/BinderPanel.css`:

```css
/* ─── Drop zone highlight ───────────────────────────────── */
.binder-panel[data-drop-zone] {
  transition: box-shadow 0.15s;
}

.binder-panel[data-drop-zone]:has(~ * .drag-active),
.binder-panel--drop-ready {
  box-shadow: 0 0 0 2px var(--accent), 0 0 16px var(--accent-glow);
}

/* Empty slot ambient glow */
.binder-panel__slot--empty {
  box-shadow: inset 0 0 8px rgba(124, 58, 237, 0.15);
  transition: box-shadow 0.2s;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BinderPanel/BinderPanel.css
git commit -m "feat: drop zone highlight CSS for binder panel"
```

---

## Task 6: BinderPanel — 3D book-flip page turn

**Files:**
- Modify: `src/components/BinderPanel/BinderPanel.tsx`
- Modify: `src/components/BinderPanel/BinderPanel.css`

- [ ] **Step 1: Add flip animation CSS**

Append to `src/components/BinderPanel/BinderPanel.css`:

```css
/* ─── Book flip page turn ───────────────────────────────── */
.binder-panel__page-wrap {
  perspective: 1200px;
  width: 100%;
}

.binder-panel__grid {
  transform-style: preserve-3d;
  transform-origin: center;
}

.binder-panel__grid--flip-out-right {
  animation: flip-out-right 0.25s ease-in forwards;
}

.binder-panel__grid--flip-in-right {
  animation: flip-in-right 0.25s ease-out forwards;
}

.binder-panel__grid--flip-out-left {
  animation: flip-out-left 0.25s ease-in forwards;
}

.binder-panel__grid--flip-in-left {
  animation: flip-in-left 0.25s ease-out forwards;
}

@keyframes flip-out-right {
  from { transform: rotateY(0deg);   opacity: 1; }
  to   { transform: rotateY(-90deg); opacity: 0.4; }
}

@keyframes flip-in-right {
  from { transform: rotateY(90deg);  opacity: 0.4; }
  to   { transform: rotateY(0deg);   opacity: 1; }
}

@keyframes flip-out-left {
  from { transform: rotateY(0deg);  opacity: 1; }
  to   { transform: rotateY(90deg); opacity: 0.4; }
}

@keyframes flip-in-left {
  from { transform: rotateY(-90deg); opacity: 0.4; }
  to   { transform: rotateY(0deg);   opacity: 1; }
}
```

- [ ] **Step 2: Add flip state to BinderPanel.tsx**

In `src/components/BinderPanel/BinderPanel.tsx`, add these state variables after the existing `useState` declarations (they go inside the component, after `const [page, setPage] = useState(0)`):

```tsx
const [flipClass, setFlipClass] = useState('')
const animatingRef = useRef(false)
```

And add the import for `useRef` if not already present:
```tsx
import { useState, useRef } from 'react'
```

- [ ] **Step 3: Add flip navigation function**

Add this function inside the binder view section (after `const pageCards = ...`):

```tsx
function flipToPage(next: number) {
  if (animatingRef.current) return
  animatingRef.current = true
  const direction = next > page ? 'right' : 'left'
  setFlipClass(`binder-panel__grid--flip-out-${direction}`)
  setTimeout(() => {
    setPage(next)
    setFlipClass(`binder-panel__grid--flip-in-${direction}`)
    setTimeout(() => {
      setFlipClass('')
      animatingRef.current = false
    }, 250)
  }, 250)
}
```

- [ ] **Step 4: Wrap grid and update pagination buttons**

In the binder view JSX, wrap the grid div and update pagination:

```tsx
// REPLACE the existing grid + pagination:
<div className="binder-panel__page-wrap">
  <div className={`binder-panel__grid ${flipClass}`.trim()}>
    {Array.from({ length: 9 }, (_, i) => {
      const entry = pageCards[i]
      return entry ? (
        <div
          key={entry.id}
          className="binder-panel__slot"
          onPointerDown={e =>
            onStartDrag(entry.id, entry.card.image_url, e.currentTarget)
          }
        >
          <HoloCard
            card={entry.card}
            size="sm"
            interactive={false}
            holoSeed={entry.holo_seed ?? undefined}
          />
        </div>
      ) : (
        <div key={`empty-${i}`} className="binder-panel__slot binder-panel__slot--empty" />
      )
    })}
  </div>
</div>

{totalPages > 1 && (
  <div className="binder-panel__pagination">
    <button
      className="btn btn--secondary btn--xs"
      onClick={() => flipToPage(Math.max(0, page - 1))}
      disabled={page === 0}
    >
      ‹
    </button>
    <span>{page + 1} / {totalPages}</span>
    <button
      className="btn btn--secondary btn--xs"
      onClick={() => flipToPage(Math.min(totalPages - 1, page + 1))}
      disabled={page === totalPages - 1}
    >
      ›
    </button>
  </div>
)}
```

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/BinderPanel/BinderPanel.tsx src/components/BinderPanel/BinderPanel.css
git commit -m "feat: binder 3D book-flip page turn animation"
```

---

## Task 7: Shop — CSS scroll-snap carousel + IntersectionObserver

**Files:**
- Create: `src/routes/Shop.css`
- Modify: `src/routes/Shop.tsx`

- [ ] **Step 1: Create Shop.css**

```css
/* src/routes/Shop.css */

.shop {
  min-height: 100vh;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.shop__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.shop__title {
  font-size: 2rem;
  font-weight: 800;
}

.shop__header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* ─── Carousel ───────────────────────────────────────────── */
.shop__carousel-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.shop__carousel {
  display: flex;
  gap: 2rem;
  overflow-x: scroll;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  padding: 3rem 4rem;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.shop__carousel::-webkit-scrollbar { display: none; }

.shop__carousel-arrow {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  font-size: 1.2rem;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  z-index: 1;
}

.shop__carousel-arrow:hover { background: var(--border); }
.shop__carousel-arrow:disabled { opacity: 0.3; cursor: default; }

/* ─── Pack card ──────────────────────────────────────────── */
.pack-card {
  scroll-snap-align: center;
  flex-shrink: 0;
  width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem 1rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  transform: scale(0.85);
  opacity: 0.55;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
              opacity 0.35s ease,
              border-color 0.35s ease;
}

.pack-card--active {
  transform: scale(1);
  opacity: 1;
  border-color: var(--accent);
  animation: pack-breathe 3s ease-in-out infinite;
}

@keyframes pack-breathe {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.02); }
}

.pack-card__img {
  width: 160px;
  height: auto;
  object-fit: contain;
  border-radius: 6px;
  position: relative;
}

/* Shimmer on active pack */
.pack-card--active .pack-card__img-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background: linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%);
  background-size: 200% 200%;
  animation: shimmer-sweep 4s linear infinite;
  pointer-events: none;
}

@keyframes shimmer-sweep {
  0%   { background-position: -100% -100%; }
  100% { background-position: 200% 200%; }
}

.pack-card__img-wrap {
  position: relative;
}

.pack-card__name {
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
}

.pack-card__price {
  color: var(--gold);
  font-weight: 600;
  font-size: 0.95rem;
}

.pack-card__buy {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
  width: 100%;
}

.pack-card--active .pack-card__buy {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.shop__loading {
  text-align: center;
  color: var(--text-muted);
  padding: 4rem;
}
```

- [ ] **Step 2: Rewrite Shop.tsx**

```tsx
import { use, Suspense, useRef, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../hooks/useAuth'
import { useCurrency } from '../hooks/useCurrency'
import CurrencyDisplay from '../components/ui/CurrencyDisplay'
import { fetchPacks } from '../lib/queries'
import type { Pack } from '../types'
import './Shop.css'

const packsPromise = fetchPacks()

function PackList() {
  const packs = use(packsPromise)
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const carouselRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  function handleBuy(pack: Pack) {
    if (state.currency < pack.price) return
    dispatch({ type: 'DEDUCT_CURRENCY', amount: pack.price })
    navigate('/pack-opening', { state: { packId: pack.id } })
  }

  // IntersectionObserver — detect centered pack
  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return
    const slots = carousel.querySelectorAll<HTMLElement>('.pack-card')
    if (!slots.length) return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
            const idx = Array.from(slots).indexOf(entry.target as HTMLElement)
            if (idx !== -1) setActiveIndex(idx)
          }
        })
      },
      { root: carousel, threshold: 0.8 }
    )

    slots.forEach(slot => observer.observe(slot))
    return () => observer.disconnect()
  }, [packs])

  const scrollTo = useCallback((dir: -1 | 1) => {
    carouselRef.current?.scrollBy({ left: dir * 252, behavior: 'smooth' })
  }, [])

  return (
    <div className="shop__carousel-wrap">
      <button
        className="shop__carousel-arrow"
        onClick={() => scrollTo(-1)}
        disabled={activeIndex === 0}
        aria-label="Previous pack"
      >
        ‹
      </button>

      <div ref={carouselRef} className="shop__carousel">
        {packs.map((pack, i) => (
          <div
            key={pack.id}
            className={`pack-card${activeIndex === i ? ' pack-card--active' : ''}`}
          >
            <div className="pack-card__img-wrap">
              <img src={pack.image_url} alt={pack.name} className="pack-card__img" />
            </div>
            <h3 className="pack-card__name">{pack.name}</h3>
            <p className="pack-card__price">✦ {pack.price}</p>
            <button
              className="btn btn--primary pack-card__buy"
              onClick={() => handleBuy(pack)}
              disabled={state.currency < pack.price}
            >
              {state.currency < pack.price ? 'Not enough ✦' : 'Open Pack'}
            </button>
          </div>
        ))}
      </div>

      <button
        className="shop__carousel-arrow"
        onClick={() => scrollTo(1)}
        disabled={activeIndex === packs.length - 1}
        aria-label="Next pack"
      >
        ›
      </button>
    </div>
  )
}

export default function Shop() {
  const { signOut } = useAuth()
  const { claim } = useCurrency()
  const navigate = useNavigate()

  return (
    <div className="shop">
      <header className="shop__header">
        <h1 className="shop__title">Shop</h1>
        <div className="shop__header-right">
          <CurrencyDisplay />
          <button className="btn btn--secondary shop__daily" onClick={claim}>
            Claim Daily ✦50
          </button>
          <button className="btn btn--secondary" onClick={() => navigate('/collection')}>Collection</button>
          <button className="btn btn--secondary" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      <Suspense fallback={<p className="shop__loading">Loading packs…</p>}>
        <PackList />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 3: Remove old shop styles from global.css**

In `src/styles/global.css`, find and remove the shop-related rules (`.shop`, `.shop__header`, `.shop__packs`, `.pack-card`, etc.). These are now in `Shop.css`.

Run:
```bash
grep -n "\.shop\|\.pack-card" src/styles/global.css
```

Remove the matching blocks.

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Shop.tsx src/routes/Shop.css src/styles/global.css
git commit -m "feat: shop carousel — CSS scroll-snap, IntersectionObserver active pack, shimmer"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Pack breathing idle animation | Task 1 |
| Continuous shimmer | Task 1 |
| Horizontal drag-to-rip with clip-path halves | Task 2 |
| Tear threshold 80px or velocity | Task 2 |
| Halves fly off with rotate | Task 1 (CSS) + Task 2 (state) |
| Snap back if below threshold | Task 2 |
| One-at-a-time card deal, face-down | Task 2 |
| Click to flip, click to advance | Task 2 |
| Progress indicator N/10 | Task 2 |
| ParticleBurst on ultra/secret | Task 2 |
| Summary fan-in with stagger | Task 1 (CSS) + Task 2 (JSX) |
| useDrag hook with pointer events | Task 3 |
| Opaque clone follows cursor | Task 3 |
| Clone rotation based on velocity | Task 3 |
| Drop zone detection via elementsFromPoint | Task 3 |
| Collection replaces HTML5 drag | Task 4 |
| BinderPanel replaces HTML5 drag | Task 4 |
| data-drop-zone attributes | Task 4 |
| Drop zone highlight CSS | Task 5 |
| Binder 3D book flip | Task 6 |
| Direction-aware flip (next/prev) | Task 6 |
| Mid-flip page swap timing | Task 6 |
| animating guard prevents double-click | Task 6 |
| Shop carousel scroll-snap | Task 7 |
| IntersectionObserver active pack | Task 7 |
| Scale/opacity for inactive packs | Task 7 |
| Breathing + shimmer on active pack | Task 7 |
| Buy button slides up on active | Task 7 |
| Prev/next arrow buttons | Task 7 |

All spec requirements covered. ✓

**Type consistency:**
- `onDragStart` → `onStartDrag` updated consistently in Collection.tsx and BinderPanel.tsx Props ✓
- `startDrag(entryId, imageUrl, el)` signature matches useDrag return and all call sites ✓
- `flipToPage(next: number)` uses `page` and `totalPages` from binder view scope ✓
- `data-drop-zone` attribute strings: `"bulk"` and `"binder-{id}"` match handler parsing in `handleDrop` ✓

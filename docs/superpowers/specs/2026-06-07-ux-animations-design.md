# UX Animations & Interactions — Design Spec
*2026-06-07*

## Scope

Four areas: pack opening flow, collection/binder drag-and-drop, shop carousel, binder page turn. Zero new dependencies — pure CSS, pointer events, IntersectionObserver.

---

## 1. Pack Opening Flow

### State Machine

```
idle → grabbed → tearing → discarded → dealing(index: 0..9) → summary
```

### Idle State
- Pack breathes: `scale(1.0) → scale(1.02)` on a 3s ease-in-out loop (`@keyframes pack-breathe`)
- Shimmer sweep animates continuously (not hover-only): `background-position` pan on `::after` pseudo-element, 4s linear infinite

### Grab & Tear Gesture
- User initiates with `pointerdown` on the pack
- `pointermove` tracks horizontal delta (`dx`)
- Pack visually stretches: left half clip-path follows `-dx`, right half follows `+dx` in real-time
- Clip-paths change from current horizontal cut (top/bottom) to **vertical cut** (left/right):
  - Left half: `polygon(0 0, 50% 0, 50% 100%, 0 100%)`
  - Right half: `polygon(50% 0, 100% 0, 100% 100%, 50% 100%)`
- At `dx >= 80px` OR `pointerup` with velocity `>= 0.5px/ms`: trigger full tear
- Full tear: left half flies to `-200vw`, right half to `+200vw`, both with slight rotate (±15°) and opacity fade — 0.4s ease-in
- If drag released below threshold: pack snaps back with spring (`cubic-bezier(0.34, 1.56, 0.64, 1)`)

### Deal Phase
- After `discarded` state: single card appears center-screen, face-down
- Card back rendered as `.card-back` div (existing style)
- Click/tap flips card face-up (existing `.card-flip` + `.card-flip__inner--flipped`)
- After flip reveals card, "Next →" hint pulses; another click advances `dealIndex`
- Progress indicator: `"3 / 10"` bottom-center, monospace, muted color
- `ParticleBurst` fires on flip if `rarity === 'ultra_rare' || 'secret_rare'` (existing behavior preserved)
- No auto-advance — fully click-driven, user controls pace

### Summary View
- After card 10 is flipped and advanced: transition to `summary` state
- All 10 cards fan into grid with staggered entrance: each card animates from center-screen to its grid position
- Stagger: `animation-delay: index * 60ms`
- "Add to Collection" CTA appears after last card lands
- Existing `handleComplete()` flow unchanged

### Implementation Notes
- State lives in `PackRip.tsx` as `phase: 'idle' | 'grabbed' | 'tearing' | 'discarded' | 'dealing' | 'summary'` + `dealIndex: number`
- Drag tracking: `pointerdown` sets `grabX`, `pointermove` computes `dx`, stored in `useRef` (no re-render on every pixel)
- CSS custom property `--tear-dx` set on pack element drives clip-path via `style` prop during drag
- `pointercancel` treated same as low-velocity release (snap back)

---

## 2. Collection & Binder Drag-and-Drop

### Replace HTML5 Drag with Pointer Events

Current native HTML5 drag is replaced entirely. No `draggable`, no `dragstart`/`dragover`/`drop`.

### Drag Lifecycle

**`pointerdown` on card:**
- Record `cardId`, `entryId`, source zone
- Create opaque clone: `<img src={card.image_url}>` injected into `document.body`, `position: fixed`, sized to match original card
- Set `pointer-events: none` on clone (so pointer events pass through to drop zones)
- Set original card opacity to `0.3` (ghosted, not hidden — shows the gap)

**`pointermove`:**
- Clone follows cursor: `left: e.clientX - offsetX`, `top: e.clientY - offsetY`
- Slight rotation: `rotate(${dx * 0.05}deg)` where `dx` is horizontal velocity (clamped ±8°)
- Drop zones with matching accept criteria get `.drop-zone--active` class (pulsing border)

**`pointerup`:**
- Valid drop zone: clone snaps to destination center (`transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)`), then remove clone, trigger existing `onMoveCard` logic
- Invalid zone: clone snaps back to origin, same easing, remove on `transitionend`
- `pointercancel`: snap back immediately

### Drop Zone Highlighting
- Active (card hovering over): `box-shadow: 0 0 0 2px var(--accent), 0 0 12px var(--accent-glow)`
- Empty binder slot (always): soft glow `0 0 8px rgba(124, 58, 237, 0.2)` — stronger when drag is nearby

### Implementation Notes
- Custom hook `useDrag(onDrop)` encapsulates all pointer event logic
- Clone element managed via `useRef<HTMLImageElement>` — single element reused per drag session
- `document.addEventListener('pointermove' / 'pointerup')` attached only while drag is active (cleanup on drop)
- Works identically in Collection bulk view and BinderPanel binder view

---

## 3. Shop Carousel

### Layout
- `.shop__carousel` — horizontal scroll container, `overflow-x: scroll`, `scroll-snap-type: x mandatory`, `scroll-behavior: smooth`
- Each `.pack-card` — `scroll-snap-align: center`, `flex-shrink: 0`, width `220px`
- Centered pack detected via `IntersectionObserver` with `threshold: 0.8` — adds `.pack-card--active` class

### Active Pack Behavior
- Scale `1.0`, opacity `1.0`
- Breathing animation (`pack-breathe`, 3s loop) — same keyframe as pack opening idle
- Continuous shimmer sweep on pack image
- Buy button visible (slides up from `translateY(8px)` opacity 0 → 1)

### Inactive Packs
- Scale `0.85`, opacity `0.55`
- No animation
- Buy button hidden

### Navigation
- Prev/next arrow buttons: `position: absolute` on carousel sides, call `carousel.scrollBy(±220px)`
- Pointer drag on carousel: `pointerdown` → `pointermove` manual scroll → `pointerup` snap to nearest pack
- Scrollbar hidden (`::-webkit-scrollbar { display: none }`, `scrollbar-width: none`)

---

## 4. Binder Page Turn

### Interaction
- "Next page" / "Prev page" buttons trigger a 3D book-flip transition
- Direction tracked: next = flip right-to-left, prev = flip left-to-right

### Animation
- Binder grid wrapped in `.binder-page` with `transform-style: preserve-3d`, `perspective: 1200px` on parent
- Outgoing page: `rotateY(0deg) → rotateY(-90deg)` (0.25s ease-in), then swap content, incoming: `rotateY(90deg) → rotateY(0deg)` (0.25s ease-out)
- Total: 0.5s, feels like turning a physical page
- Mid-flip (at 90°) content swaps so back of page is never visible — achieved by timing `setPage` call to 250ms mark via `setTimeout`

### Implementation Notes
- CSS class `.binder-page--flipping-out` / `.binder-page--flipping-in` drive the keyframes
- `animating` boolean ref prevents rapid double-clicks mid-flip
- `prev` direction: `rotateY(0→90deg)` out, `rotateY(-90→0deg)` in

---

## 5. Card Full-Screen Viewer (Low Priority)

After a card is flipped in the deal phase (or tapped in collection), a "View" button appears. Clicking opens the card in a full-screen overlay:
- Dark backdrop (`rgba(0,0,0,0.85)`)
- Card centered, scaled up to ~80vh tall
- HoloCard with full tilt/holo interaction active
- Click outside or "×" button closes
- No routing — modal overlay, `z-index: 200`

Implementation deferred. No spec detail needed until prioritized.

---

## Non-Goals

- No Framer Motion or animation libraries
- No sound effects
- No multi-touch pinch/zoom on cards
- Home page redesign deferred to separate spec

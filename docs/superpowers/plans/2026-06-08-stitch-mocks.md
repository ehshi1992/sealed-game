# Stitch Mocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Shop into a hero + grid layout and expand the binder panel into a full-width two-page spread view.

**Architecture:** Shop.tsx's PackList component is rewritten — carousel + IntersectionObserver removed, replaced with a static hero banner (first pack) and responsive grid. The binder spread is added to BinderPanel via a `fullWidth` prop and a new `spread` pagination counter; Collection.tsx gains `binderViewOpen` state that hides the card grid and widens the panel when a binder is open in full-width mode.

**Tech Stack:** React 19, TypeScript, pure CSS, Vitest + React Testing Library

---

## File Map

| File | Change |
|------|--------|
| `src/routes/Shop.tsx` | Rewrite `PackList` — remove carousel/IntersectionObserver, add hero + grid |
| `src/routes/Shop.css` | Rewrite — remove carousel styles, add `.shop__hero` + `.shop__grid` |
| `src/components/BinderPanel/BinderPanel.tsx` | Add `fullWidth` prop + `onBinderViewChange` callback; spread render mode |
| `src/components/BinderPanel/BinderPanel.css` | Add spread layout styles + mobile stack override |
| `src/styles/global.css` | Add `.collection--binder-view` and `.collection__main--hidden` |
| `src/routes/Collection.tsx` | Add `binderViewOpen` state; pass new props to `BinderPanel` |

---

## Task 1: Rewrite Shop CSS

**Files:**
- Modify: `src/routes/Shop.css`

- [ ] **Step 1: Replace the entire file contents**

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

/* ─── Hero banner ─────────────────────────────────────────── */
.shop__hero {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  min-height: 220px;
  display: flex;
  align-items: flex-end;
  padding: 2rem;
}

.shop__hero-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  filter: brightness(0.45);
}

.shop__hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  width: 100%;
  gap: 1rem;
  flex-wrap: wrap;
}

.shop__hero-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.shop__hero-name {
  font-size: 1.75rem;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0,0,0,0.6);
}

.shop__hero-price {
  font-size: 1rem;
  font-weight: 600;
  color: var(--gold);
}

/* ─── Pack grid ───────────────────────────────────────────── */
.shop__section-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.shop__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
}

.pack-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  transition: border-color 0.2s, transform 0.2s;
}

.pack-card:hover {
  border-color: var(--accent);
  transform: translateY(-3px);
}

.pack-card__img-wrap {
  overflow: hidden;
  border-radius: 6px;
}

.pack-card__img {
  width: 100%;
  max-width: 140px;
  height: auto;
  object-fit: contain;
  display: block;
}

.pack-card__name {
  font-size: 0.95rem;
  font-weight: 700;
  text-align: center;
}

.pack-card__price {
  color: var(--gold);
  font-weight: 600;
  font-size: 0.9rem;
}

.pack-card__buy {
  width: 100%;
}

.shop__loading {
  text-align: center;
  color: var(--text-muted);
  padding: 4rem;
}

/* ─── Responsive ──────────────────────────────────────────── */
@media (max-width: 900px) {
  .shop__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 640px) {
  .shop__header {
    flex-direction: column;
    align-items: stretch;
  }
  .shop__header-right {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .shop__grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .shop__hero {
    min-height: 160px;
    padding: 1.25rem;
  }
  .shop__hero-name {
    font-size: 1.3rem;
  }
}
```

- [ ] **Step 2: Verify no compile errors**

Run: `npm run build 2>&1 | tail -20`
Expected: no TypeScript or CSS errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/Shop.css
git commit -m "style(shop): replace carousel CSS with hero + grid layout"
```

---

## Task 2: Rewrite Shop TSX (PackList)

**Files:**
- Modify: `src/routes/Shop.tsx`

- [ ] **Step 1: Replace PackList component** (keep `Shop` parent unchanged, keep `packsPromise` module-level)

Replace everything from `function PackList()` through its closing `}` with:

```tsx
function PackList() {
  const packs = use(packsPromise)
  const { state, dispatch } = useApp()
  const navigate = useNavigate()

  function handleBuy(pack: Pack) {
    if (state.currency < pack.price) return
    dispatch({ type: 'DEDUCT_CURRENCY', amount: pack.price })
    navigate('/pack-opening', { state: { packId: pack.id } })
  }

  const [featured, ...rest] = packs

  return (
    <div className="shop__pack-content">
      {featured && (
        <div className="shop__hero">
          <img src={featured.image_url} alt="" className="shop__hero-bg" aria-hidden="true" />
          <div className="shop__hero-content">
            <div className="shop__hero-info">
              <h2 className="shop__hero-name">{featured.name}</h2>
              <p className="shop__hero-price">✦ {featured.price}</p>
            </div>
            <button
              className="btn btn--primary"
              onClick={() => handleBuy(featured)}
              disabled={state.currency < featured.price}
            >
              {state.currency < featured.price ? 'Not enough ✦' : 'Open Pack'}
            </button>
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <section>
          <h3 className="shop__section-title">All Packs</h3>
          <div className="shop__grid">
            {rest.map(pack => (
              <div key={pack.id} className="pack-card">
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
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Remove unused imports**

Remove `useRef`, `useEffect`, `useState` from the import line (they're no longer used in `PackList`). The `Shop` component still uses none of them either — verify `Shop` parent uses none before removing.

The import line should become:
```tsx
import { use, Suspense } from 'react'
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: clean build, no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/Shop.tsx
git commit -m "feat(shop): replace carousel with hero banner + pack grid"
```

---

## Task 3: BinderPanel spread CSS

**Files:**
- Modify: `src/components/BinderPanel/BinderPanel.css`

- [ ] **Step 1: Append spread layout styles to end of BinderPanel.css**

```css
/* ─── Full-width two-page spread ───────────────────────────── */
.binder-panel--spread {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.binder-panel__spread-wrap {
  display: flex;
  flex: 1;
  gap: 0;
}

.binder-panel__page {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

.binder-panel__spread-divider {
  width: 2px;
  background: var(--border);
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
}

/* Cards in spread slots should fill the slot */
.binder-panel--spread .binder-panel__slot .card {
  width: 100% !important;
  height: 100% !important;
}

/* Subtle page shadow for depth */
.binder-panel__page:first-child {
  box-shadow: inset -4px 0 12px rgba(0, 0, 0, 0.08);
}

.binder-panel__page:last-child {
  box-shadow: inset 4px 0 12px rgba(0, 0, 0, 0.08);
}

/* ─── Mobile: stack pages vertically ───────────────────────── */
@media (max-width: 640px) {
  .binder-panel__spread-wrap {
    flex-direction: column;
  }
  .binder-panel__spread-divider {
    width: 100%;
    height: 2px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BinderPanel/BinderPanel.css
git commit -m "style(binder): add full-width spread layout CSS"
```

---

## Task 4: BinderPanel spread TSX

**Files:**
- Modify: `src/components/BinderPanel/BinderPanel.tsx`

- [ ] **Step 1: Update Props type**

Replace the existing `Props` type:

```tsx
type Props = {
  binders: Binder[]
  collection: CollectionEntry[]
  onStartDrag: (entryId: string, imageUrl: string, el: HTMLElement) => void
  onCreateBinder: (name: string, color: string) => Promise<void>
  onDeleteBinder: (binderId: string) => Promise<void>
  fullWidth?: boolean
  onBinderViewChange?: (open: boolean) => void
}
```

- [ ] **Step 2: Update function signature**

```tsx
export default function BinderPanel({
  binders,
  collection,
  onStartDrag,
  onCreateBinder,
  onDeleteBinder,
  fullWidth = false,
  onBinderViewChange,
}: Props) {
```

- [ ] **Step 3: Fire onBinderViewChange when binder selection changes**

Replace the two calls to `setSelectedBinderId` in the list view with wrapped versions:

In the list view row `onClick`:
```tsx
onClick={() => {
  setSelectedBinderId(binder.id)
  setPage(0)
  onBinderViewChange?.(true)
}}
```

In the binder view "back" button (header), replace the existing back button:
```tsx
<button
  className="btn btn--secondary btn--sm"
  onClick={() => {
    setSelectedBinderId(null)
    onBinderViewChange?.(false)
  }}
>
  ←
</button>
```

- [ ] **Step 4: Add spread render mode to binder view**

After the existing binder view slot-building logic (the `pageSlots` and `positionedMap` code), add a `spread` counter. Replace the `page` state usage in binder view with `spread` when `fullWidth` is true.

**Replace the binder view return block** (the second `return` starting at `return (` after `// ── Binder view`) with:

```tsx
  // When fullWidth, show 18 slots (two 3×3 pages) per spread
  const SLOTS_PER_VIEW = fullWidth ? 18 : 9
  const totalViews = Math.max(1, Math.ceil(allBinderCards.length / SLOTS_PER_VIEW))

  const viewSlots: (typeof allBinderCards[0] | null)[] = Array.from({ length: SLOTS_PER_VIEW }, (_, i) => {
    const globalSlot = page * SLOTS_PER_VIEW + i
    return positionedMap.get(globalSlot) ?? null
  })
  let unpIdx2 = 0
  for (let i = 0; i < SLOTS_PER_VIEW; i++) {
    if (!viewSlots[i] && unpIdx2 < unpositioned.length) {
      viewSlots[i] = unpositioned[unpIdx2++]
    }
  }

  function renderSlot(entry: typeof allBinderCards[0] | null, globalSlot: number) {
    return entry ? (
      <div
        key={entry.id}
        className="binder-panel__slot"
        data-drop-zone={`binder-slot:${binder.id}:${globalSlot}`}
        onPointerDown={e => {
          e.preventDefault()
          onStartDrag(entry.id, entry.card.image_url, e.currentTarget)
        }}
      >
        <HoloCard
          card={entry.card}
          size="sm"
          interactive={false}
          holoSeed={entry.holo_seed ?? undefined}
        />
      </div>
    ) : (
      <div
        key={`empty-${globalSlot}`}
        className="binder-panel__slot binder-panel__slot--empty"
        data-drop-zone={`binder-slot:${binder.id}:${globalSlot}`}
      />
    )
  }

  const paginationControls = totalViews > 1 && (
    <div className="binder-panel__pagination">
      <button
        className="btn btn--secondary btn--xs"
        onClick={() => flipToPage(Math.max(0, page - 1))}
        disabled={page === 0}
      >‹</button>
      <span>{page + 1} / {totalViews}</span>
      <button
        className="btn btn--secondary btn--xs"
        onClick={() => flipToPage(Math.min(totalViews - 1, page + 1))}
        disabled={page === totalViews - 1}
      >›</button>
    </div>
  )

  const spreadHeader = (
    <div className="binder-panel__header">
      <button
        className="btn btn--secondary btn--sm"
        onClick={() => {
          setSelectedBinderId(null)
          onBinderViewChange?.(false)
        }}
      >←</button>
      <span className="binder-panel__swatch" style={{ background: binder.color }} />
      <span className="binder-panel__title">{binder.name}</span>
      <span className="binder-panel__count">{allBinderCards.length} cards</span>
    </div>
  )

  if (fullWidth) {
    const leftSlots = viewSlots.slice(0, 9)
    const rightSlots = viewSlots.slice(9, 18)
    const baseGlobal = page * 18

    return (
      <div className="binder-panel binder-panel--spread" data-drop-zone={`binder:${binder.id}`}>
        {spreadHeader}
        <div className="binder-panel__spread-wrap">
          <div className="binder-panel__page">
            <div className="binder-panel__page-wrap">
              <div className={`binder-panel__grid ${flipClass}`.trim()}>
                {leftSlots.map((entry, i) => renderSlot(entry, baseGlobal + i))}
              </div>
            </div>
          </div>
          <div className="binder-panel__spread-divider" />
          <div className="binder-panel__page">
            <div className="binder-panel__page-wrap">
              <div className={`binder-panel__grid ${flipClass}`.trim()}>
                {rightSlots.map((entry, i) => renderSlot(entry, baseGlobal + 9 + i))}
              </div>
            </div>
          </div>
        </div>
        {paginationControls}
      </div>
    )
  }

  // ── Narrow panel (existing behavior) ─────────────────────
  return (
    <div
      className="binder-panel"
      data-drop-zone={`binder:${binder.id}`}
    >
      {spreadHeader}
      <div className="binder-panel__page-wrap">
        <div className={`binder-panel__grid ${flipClass}`.trim()}>
          {Array.from({ length: 9 }, (_, i) => {
            const globalSlot = page * 9 + i
            return renderSlot(viewSlots[i] ?? null, globalSlot)
          })}
        </div>
      </div>
      {paginationControls}
    </div>
  )
```

> **Note:** The existing binder view return block (from `return (` to the final `}` of the component) is entirely replaced by the code above. Also delete the old variables `totalPages`, `pageSlots`, and `unpIdx` — they are superseded by `totalViews`, `viewSlots`, and `unpIdx2` in the new code.

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: clean — no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/components/BinderPanel/BinderPanel.tsx
git commit -m "feat(binder): add fullWidth two-page spread mode"
```

---

## Task 5: Collection — binder view state + CSS

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/routes/Collection.tsx`

- [ ] **Step 1: Add collection binder-view CSS to global.css**

Append after the last `.collection__grid--droptarget` block:

```css
/* Binder full-width spread view */
.collection--binder-view .collection__main {
  display: none;
}

.collection--binder-view .collection__panel-wrapper {
  width: 100%;
  position: static;
  max-height: none;
  overflow-y: visible;
}
```

- [ ] **Step 2: Add binderViewOpen state to Collection.tsx**

After the existing `const [panelOpen, setPanelOpen] = useState(false)` line, add:

```tsx
const [binderViewOpen, setBinderViewOpen] = useState(false)
```

- [ ] **Step 3: Update root div className in Collection.tsx**

Replace:
```tsx
<div className={`collection${panelOpen ? ' collection--panel-open' : ''}`}>
```
With:
```tsx
<div className={`collection${panelOpen ? ' collection--panel-open' : ''}${binderViewOpen ? ' collection--binder-view' : ''}`}>
```

- [ ] **Step 4: Pass new props to BinderPanel**

Replace the existing `<BinderPanel` usage:
```tsx
<BinderPanel
  binders={binders}
  collection={collection}
  onStartDrag={startDrag}
  onCreateBinder={handleCreateBinder}
  onDeleteBinder={handleDeleteBinder}
/>
```
With:
```tsx
<BinderPanel
  binders={binders}
  collection={collection}
  onStartDrag={startDrag}
  onCreateBinder={handleCreateBinder}
  onDeleteBinder={handleDeleteBinder}
  fullWidth={binderViewOpen}
  onBinderViewChange={setBinderViewOpen}
/>
```

- [ ] **Step 5: Reset binderViewOpen when panel closes**

Replace the existing panel toggle button onClick:
```tsx
onClick={() => setPanelOpen(o => !o)}
```
With:
```tsx
onClick={() => {
  setPanelOpen(o => {
    if (o) setBinderViewOpen(false)
    return !o
  })
}}
```

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: clean build

- [ ] **Step 7: Run tests**

Run: `npm run test -- --run`
Expected: all existing tests pass

- [ ] **Step 8: Commit**

```bash
git add src/styles/global.css src/routes/Collection.tsx
git commit -m "feat(collection): binder full-width spread view — hides grid, expands panel"
```

---

## Task 6: Manual verification

- [ ] **Start dev server**

Run: `npm run dev`

- [ ] **Verify Shop**
  - Open `http://localhost:5173/shop`
  - First pack renders as a hero banner (full-width, image bg, name, price, Open Pack button)
  - Remaining packs render in a grid below (4-col desktop, 2-col mobile)
  - "Open Pack" button on any pack navigates to pack opening
  - "Not enough ✦" disables button when currency insufficient

- [ ] **Verify Binder spread**
  - Navigate to `/collection`, open the Binders panel
  - Click any binder — collection grid hides, binder spread fills full width showing two 3×3 pages side by side
  - Center divider visible between pages
  - Pagination updates both pages simultaneously
  - "← Back" button returns to collection grid view
  - Dragging cards between spread slots works
  - On mobile viewport (≤640px): left and right pages stack vertically

- [ ] **Commit if any minor fixes were made**

```bash
git add -p
git commit -m "fix: manual verification adjustments"
```

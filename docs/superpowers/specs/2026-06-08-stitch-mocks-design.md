# Stitch Mocks Implementation — Design Spec

**Date:** 2026-06-08  
**Scope:** Shop layout redesign (S1) + Binder two-page spread (B2)  
**Out of scope:** global nav, card values/analytics, collection spotlight, marketplace, trade table

---

## 1. Shop Redesign (S1)

### Goal
Replace the horizontal carousel with a sectioned layout matching the Stitch booster store mock — hero banner + pack grid.

### Layout

**Hero banner** (full width)
- Renders the first pack returned by `fetchPacks()` (no DB change needed)
- Background: pack `image_url` with dark overlay
- Content: pack name, price badge, "Open Pack" CTA button
- Clicking CTA: same immediate `navigate('/pack-opening', { state: { packId } })` behavior

**Pack grid** (below hero)
- All packs (including the featured one) rendered in a responsive grid
- Desktop: 4 columns. Mobile: 2 columns.
- Each card: pack image, name, price badge, "Open Pack" button
- Disabled state when `currency < pack.price` (same as current)

### Changes
- `PackList` in `Shop.tsx`: remove carousel, `IntersectionObserver`, `activeIndex` state, `scrollToIndex`. Replace with hero + grid render.
- `Shop.css`: rewrite — delete carousel styles, add `.shop__hero` and `.shop__grid` styles.
- No changes to buy logic or `Shop` parent component.

---

## 2. Binder Two-Page Spread (B2)

### Goal
When a user opens a binder, the collection grid is replaced by a full-width two-page binder spread (left page + right page, 3×3 each = 18 slots per spread).

### State changes in `Collection.tsx`
- Add `binderViewOpen: boolean` state (default `false`)
- `binderViewOpen = true` when: panel is open AND a binder is selected inside `BinderPanel`
- `binderViewOpen = false` when: user clicks "← Back to Collection" or closes the panel

### Layout modes
**Collection view** (`binderViewOpen = false`): existing grid layout, panel slides in from right as now.

**Binder view** (`binderViewOpen = true`):
- Collection grid hidden (`display: none` or conditional render)
- `BinderPanel` renders in full-width mode — passed via `fullWidth` boolean prop
- Binder list view still renders in the side panel (for switching binders); binder spread fills the main content area

### `BinderPanel` changes
- New prop: `fullWidth: boolean`
- New callback prop: `onBinderViewChange: (open: boolean) => void` — fires when selected binder changes (truthy = spread open, null = spread closed)
- When `fullWidth = true` and a binder is selected:
  - Render spread layout: two 3×3 grids side by side with a center divider
  - Left page: slots `spread * 18 + 0` through `spread * 18 + 8`
  - Right page: slots `spread * 18 + 9` through `spread * 18 + 17`
  - Pagination: `spread` counter (not `page`), prev/next advances by 18
  - Header: binder name + "← Back to Collection" button (calls `onBinderViewChange(false)`, sets `selectedBinderId = null`)
- When `fullWidth = false` (current panel mode): existing 3×3 single-page behavior unchanged

### Mobile behavior
- Full 18-slot spread still renders; CSS stacks the two pages vertically on mobile (`max-width: 640px`)
- Pagination advances by 18 on all screen sizes
- No JS branching needed — layout is CSS-only

### Drag-and-drop
- Drop zones on spread slots use same `binder-slot:{binderId}:{globalSlot}` format — no logic changes in `Collection.tsx`
- Both pages' slots are live drop targets simultaneously

### Visual style
- No leather texture or skeuomorphic styling
- Center divider: 2px solid `var(--border-color)` or similar subtle line
- Subtle `box-shadow` on each page panel (inset paper effect)
- Consistent with current design system (colors, radii, typography)

---

## Files Affected

| File | Change |
|------|--------|
| `src/routes/Shop.tsx` | Rewrite `PackList` — remove carousel, add hero + grid |
| `src/routes/Shop.css` | Rewrite carousel styles → hero + grid styles |
| `src/routes/Collection.tsx` | Add `binderViewOpen` state, pass `fullWidth` + `onBinderViewChange` to `BinderPanel` |
| `src/components/BinderPanel/BinderPanel.tsx` | Add `fullWidth` prop, spread layout, `onBinderViewChange` callback |
| `src/components/BinderPanel/BinderPanel.css` | Add spread layout styles, mobile override |

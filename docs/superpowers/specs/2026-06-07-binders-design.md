# Binders — Design Spec

**Date:** 2026-06-07  
**Status:** Approved

## Overview

Sub-collections of cards with physical simulation intent. Cards **move** out of bulk into a binder — one card, one location. Future visual: cardboard box with 5 rows, cards lift on hover. This spec covers the data model, state, and interaction layer only (not the future 3D/box visual).

---

## Database

New migration:

```sql
CREATE TABLE binders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_collection
  ADD COLUMN binder_id uuid REFERENCES binders(id) ON DELETE SET NULL;
```

- `binder_id = null` → card is in bulk
- `ON DELETE SET NULL` → deleting a binder returns all its cards to bulk automatically
- RLS on `binders`: owner-only (SELECT, INSERT, UPDATE, DELETE)
- `user_collection` RLS unchanged

---

## Types

Add to `src/types.ts`:

```ts
export type Binder = {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}
```

`CollectionEntry` gains:
```ts
binder_id?: string | null
```

`AppState` gains:
```ts
binders: Binder[]
```

New `AppAction` variants:
```ts
| { type: 'SET_BINDERS'; binders: Binder[] }
| { type: 'ADD_BINDER'; binder: Binder }
| { type: 'UPDATE_BINDER'; binder: Binder }
| { type: 'DELETE_BINDER'; binderId: string }
| { type: 'MOVE_CARD'; entryId: string; binderId: string | null }
```

`MOVE_CARD` with `binderId = null` moves card back to bulk.

`DELETE_BINDER` reducer: removes binder from `binders[]` AND sets `binder_id = null` on all `collection` entries that had that `binderId`.

---

## State

`AppContext` loads binders alongside collection on login:

```ts
const [profile, collection, binders] = await Promise.all([
  fetchProfile(user.id),
  fetchCollection(user.id),
  fetchBinders(user.id),
])
```

Derived values (computed at render, not stored):
- **Bulk**: `collection.filter(e => !e.binder_id)`
- **Binder cards**: `collection.filter(e => e.binder_id === binderId)`
- **Binder card count**: derived per binder from collection

---

## Queries (`src/lib/queries.ts`)

```ts
fetchBinders(userId: string): Promise<Binder[]>
createBinder(userId: string, name: string, color: string): Promise<Binder>
updateBinder(binderId: string, patch: { name?: string; color?: string }): Promise<void>
deleteBinder(binderId: string): Promise<void>
moveCard(entryId: string, binderId: string | null): Promise<void>
```

- `deleteBinder`: DELETE from binders — Supabase cascades `ON DELETE SET NULL` automatically, no extra query needed.
- `moveCard`: `UPDATE user_collection SET binder_id = $binderId WHERE id = $entryId`
- All mutations: optimistic dispatch → await → revert on failure

---

## UI

### Layout

`Collection.tsx` adds a side panel. When panel open, bulk grid shrinks:

```
[bulk grid (flex-grow)]  [side panel (320px fixed)]
```

Header: "Binders" toggle button (right of "Edit"). Clicking toggles panel open/closed.

### Panel State

Local state in `Collection.tsx`:

```ts
type PanelView =
  | { view: 'list' }
  | { view: 'binder'; binderId: string }

const [panelOpen, setPanelOpen] = useState(false)
const [panelView, setPanelView] = useState<PanelView>({ view: 'list' })
```

### Binder List View

- "New Binder" button → inline create form: name text input + `<input type="color">` + Save/Cancel
- Each binder row: color swatch (circle, binder.color), name, card count badge
- Click row → `{ view: 'binder', binderId }`
- Delete button per row (with confirmation): optimistically dispatch `DELETE_BINDER` (removes binder from list) + `SET_COLLECTION` with all affected entries' `binder_id` set to null, then call `deleteBinder`, revert both on error

### Binder View

- Header: ← back to list, binder name (inline edit on click), color swatch (inline `<input type="color">` on click)
- 3×3 card grid, 9 slots per page
- Empty slots: dotted border placeholder
- Prev / Next page buttons (hidden if ≤ 9 cards)
- Cards in binder: same `HoloCard size="sm"`, draggable back to bulk
- Entire panel is a drop zone when a bulk card is being dragged

### Drag-and-Drop

Native HTML5, no external library.

**Bulk → Binder:**
- Bulk card slot: `draggable={true}`, `onDragStart` → store `draggedEntryId` in local state
- Binder panel: `onDragOver={e => e.preventDefault()}`, `onDrop` → read `draggedEntryId`, dispatch `MOVE_CARD`, call `moveCard`, revert on error

**Binder → Bulk:**
- Binder card: `draggable={true}`, `onDragStart` → store `draggedEntryId`
- Bulk grid: `onDragOver` + `onDrop` → `MOVE_CARD` with `binderId = null`

Visual drag feedback: CSS `opacity: 0.5` on the card being dragged (`:drag` pseudoclass or `isDragging` state).

---

## Error Handling

All mutations: snapshot state before optimistic update, revert via `SET_COLLECTION` / `SET_BINDERS` on catch. Show `alert()` on failure (consistent with remove-cards).

---

## Out of Scope

- Custom binder logo/image (future)
- Cardboard box 3D visual (future)
- Binder ordering / sorting
- Moving multiple cards at once
- Touch drag-and-drop (dnd-kit upgrade path)

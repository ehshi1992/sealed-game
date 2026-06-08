# Remove Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to remove cards (with quantity control) from their collection via edit mode in Collection and via the card detail modal.

**Architecture:** Optimistic update in AppContext → Supabase write in background → revert on failure. New `REMOVE_CARD` reducer action. Query function in `lib/queries.ts`. Edit mode state and quantity stepper modal live in `Collection.tsx`.

**Tech Stack:** React 19, TypeScript, Supabase JS client, Vitest + React Testing Library

---

## File Map

| File | Change |
|------|--------|
| `src/types.ts` | Add `REMOVE_CARD` to `AppAction` union |
| `src/context/AppContext.tsx` | Handle `REMOVE_CARD` in reducer |
| `src/lib/queries.ts` | Add `removeFromCollection` |
| `src/routes/Collection.tsx` | Edit mode toggle, quantity stepper modal, remove button in detail modal |
| `src/routes/__tests__/Collection.test.tsx` | New test file |

---

### Task 1: Add `REMOVE_CARD` action type

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add action to AppAction union**

In `src/types.ts`, add to the `AppAction` union (after the last `|` line):

```ts
  | { type: 'REMOVE_CARD'; cardId: string; quantity: number }
```

Full updated union:
```ts
export type AppAction =
  | { type: 'SET_USER'; user: User | null }
  | { type: 'SET_CURRENCY'; currency: number }
  | { type: 'DEDUCT_CURRENCY'; amount: number }
  | { type: 'SET_COLLECTION'; collection: CollectionEntry[] }
  | { type: 'ADD_CARDS'; cards: CollectionEntry[] }
  | { type: 'REMOVE_CARD'; cardId: string; quantity: number }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add REMOVE_CARD action type"
```

---

### Task 2: Implement reducer case in AppContext

**Files:**
- Modify: `src/context/AppContext.tsx`

- [ ] **Step 1: Write failing test**

Create `src/routes/__tests__/Collection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'

// Test the reducer logic directly by extracting it — we import AppContext internals
// via a helper. Instead, test the reducer function in isolation.

// Copy of reducer logic under test (mirrors AppContext reducer)
import type { AppAction, AppState, CollectionEntry } from '../../types'

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER': return { ...state, user: action.user }
    case 'SET_CURRENCY': return { ...state, currency: action.currency }
    case 'DEDUCT_CURRENCY': return { ...state, currency: Math.max(0, state.currency - action.amount) }
    case 'SET_COLLECTION': return { ...state, collection: action.collection }
    case 'ADD_CARDS': return { ...state, collection: [...action.cards, ...state.collection] }
    case 'REMOVE_CARD': {
      const entry = state.collection.find(e => e.card_id === action.cardId)
      if (!entry) return state
      if (action.quantity >= entry.count) {
        return { ...state, collection: state.collection.filter(e => e.card_id !== action.cardId) }
      }
      return {
        ...state,
        collection: state.collection.map(e =>
          e.card_id === action.cardId ? { ...e, count: e.count - action.quantity } : e
        ),
      }
    }
    default: return state
  }
}

const baseCard = {
  id: 'card-1', name: 'Bulbasaur', set: 'base1', number: '44',
  rarity: 'common' as const, image_url: '', holo_type: 'none' as const,
}

const baseEntry: CollectionEntry = {
  id: 'entry-1', user_id: 'user-1', card_id: 'card-1',
  card: baseCard, acquired_at: '', count: 3,
}

const baseState: AppState = { user: null, currency: 0, collection: [baseEntry] }

describe('REMOVE_CARD reducer', () => {
  it('decrements count when quantity < count', () => {
    const next = reducer(baseState, { type: 'REMOVE_CARD', cardId: 'card-1', quantity: 1 })
    expect(next.collection[0].count).toBe(2)
  })

  it('removes entry when quantity equals count', () => {
    const next = reducer(baseState, { type: 'REMOVE_CARD', cardId: 'card-1', quantity: 3 })
    expect(next.collection).toHaveLength(0)
  })

  it('removes entry when quantity exceeds count', () => {
    const next = reducer(baseState, { type: 'REMOVE_CARD', cardId: 'card-1', quantity: 99 })
    expect(next.collection).toHaveLength(0)
  })

  it('is a no-op for unknown cardId', () => {
    const next = reducer(baseState, { type: 'REMOVE_CARD', cardId: 'card-999', quantity: 1 })
    expect(next.collection).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test -- Collection.test
```
Expected: FAIL — "REMOVE_CARD" case not in AppContext reducer yet.

- [ ] **Step 3: Add reducer case to AppContext**

In `src/context/AppContext.tsx`, add inside the `switch` after the `ADD_CARDS` case:

```ts
    case 'REMOVE_CARD': {
      const entry = state.collection.find(e => e.card_id === action.cardId)
      if (!entry) return state
      if (action.quantity >= entry.count) {
        return { ...state, collection: state.collection.filter(e => e.card_id !== action.cardId) }
      }
      return {
        ...state,
        collection: state.collection.map(e =>
          e.card_id === action.cardId ? { ...e, count: e.count - action.quantity } : e
        ),
      }
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test -- Collection.test
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/context/AppContext.tsx src/routes/__tests__/Collection.test.tsx
git commit -m "feat: implement REMOVE_CARD reducer case"
```

---

### Task 3: Add `removeFromCollection` query

**Files:**
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Append function to queries.ts**

```ts
export async function removeFromCollection(
  userId: string,
  cardId: string,
  quantity: number
): Promise<void> {
  const { data, error } = await supabase
    .from('user_collection')
    .select('count')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .single()

  if (error || !data) throw new Error('Failed to fetch collection entry')

  if (quantity >= (data as { count: number }).count) {
    const { error: delError } = await supabase
      .from('user_collection')
      .delete()
      .eq('user_id', userId)
      .eq('card_id', cardId)
    if (delError) throw new Error('Failed to delete collection entry')
  } else {
    const { error: updError } = await supabase
      .from('user_collection')
      .update({ count: (data as { count: number }).count - quantity })
      .eq('user_id', userId)
      .eq('card_id', cardId)
    if (updError) throw new Error('Failed to update collection entry')
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: add removeFromCollection query"
```

---

### Task 4: Edit mode + quantity stepper modal in Collection UI

**Files:**
- Modify: `src/routes/Collection.tsx`

- [ ] **Step 1: Replace Collection.tsx with full updated version**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from '../hooks/useCollection'
import { useApp } from '../context/AppContext'
import { removeFromCollection } from '../lib/queries'
import HoloCard from '../components/HoloCard/HoloCard'
import type { CollectionEntry } from '../types'

export default function Collection() {
  const navigate = useNavigate()
  const { collection } = useCollection()
  const { state, dispatch } = useApp()

  const [selected, setSelected] = useState<CollectionEntry | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [removing, setRemoving] = useState<CollectionEntry | null>(null)
  const [removeQty, setRemoveQty] = useState(1)

  function openStepper(entry: CollectionEntry) {
    setRemoving(entry)
    setRemoveQty(1)
  }

  function closeStepper() {
    setRemoving(null)
  }

  async function confirmRemove() {
    if (!removing || !state.user) return
    const snapshot = state.collection
    dispatch({ type: 'REMOVE_CARD', cardId: removing.card_id, quantity: removeQty })
    closeStepper()
    try {
      await removeFromCollection(state.user.id, removing.card_id, removeQty)
    } catch {
      dispatch({ type: 'SET_COLLECTION', collection: snapshot })
      alert('Failed to remove card. Please try again.')
    }
  }

  return (
    <div className="collection">
      <header className="collection__header">
        <button className="btn btn--secondary" onClick={() => navigate('/shop')}>
          ← Shop
        </button>
        <h1 className="collection__title">Collection</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="collection__count">{collection.length} cards</span>
          <button
            className="btn btn--secondary"
            onClick={() => setEditMode(m => !m)}
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
      </header>

      {collection.length === 0 ? (
        <div className="collection__empty">
          <p>No cards yet. Open some packs!</p>
          <button className="btn btn--primary" onClick={() => navigate('/shop')}>
            Go to Shop
          </button>
        </div>
      ) : (
        <div className="collection__grid">
          {collection.map((entry) => (
            <div
              key={entry.id}
              className={`collection__slot${editMode ? ' collection__slot--edit' : ''}`}
              onClick={() => {
                if (editMode) openStepper(entry)
                else setSelected(entry)
              }}
            >
              <HoloCard card={entry.card} size="sm" interactive={false} holoSeed={entry.holo_seed ?? undefined} />
              {entry.count > 1 && (
                <span className="collection__count-badge">×{entry.count}</span>
              )}
              {editMode && (
                <span className="collection__remove-badge">×</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card detail modal */}
      {selected && !editMode && (
        <div className="collection__modal" onClick={() => setSelected(null)}>
          <div className="collection__modal-inner" onClick={e => e.stopPropagation()}>
            <HoloCard card={selected.card} size="lg" interactive holoSeed={selected.holo_seed ?? undefined} />
            <div className="collection__modal-info">
              <h2>{selected.card.name}</h2>
              <p>{selected.card.set} · #{selected.card.number}</p>
              <p className="collection__rarity">{selected.card.rarity.replace('_', ' ')}</p>
            </div>
            <button
              className="btn btn--danger"
              onClick={() => { openStepper(selected); setSelected(null) }}
            >
              Remove
            </button>
            <button className="btn btn--secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Quantity stepper modal */}
      {removing && (
        <div className="collection__modal" onClick={closeStepper}>
          <div className="collection__modal-inner" onClick={e => e.stopPropagation()}>
            <HoloCard card={removing.card} size="sm" interactive={false} holoSeed={removing.holo_seed ?? undefined} />
            <div className="collection__modal-info">
              <h2>{removing.card.name}</h2>
              <p>{removing.card.set} · #{removing.card.number}</p>
              <p>You own: {removing.count}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                className="btn btn--secondary"
                onClick={() => setRemoveQty(q => Math.max(1, q - 1))}
                disabled={removeQty <= 1}
              >−</button>
              <span>{removeQty}</span>
              <button
                className="btn btn--secondary"
                onClick={() => setRemoveQty(q => Math.min(removing.count, q + 1))}
                disabled={removeQty >= removing.count}
              >+</button>
            </div>
            <button className="btn btn--danger" onClick={confirmRemove}>
              Remove {removeQty === removing.count ? 'all' : removeQty}
            </button>
            <button className="btn btn--secondary" onClick={closeStepper}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for edit mode badges**

In `src/routes/Collection.css` (or wherever Collection styles live — check with `grep -r "collection__slot" src/`):

Add:
```css
.collection__slot--edit {
  cursor: pointer;
}

.collection__remove-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e53e3e;
  color: white;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  pointer-events: none;
  font-weight: bold;
}

.btn--danger {
  background: #e53e3e;
  color: white;
  border: none;
}

.btn--danger:hover {
  background: #c53030;
}
```

Note: `.collection__slot` must have `position: relative` for the badge to anchor. Verify it does; add `position: relative` if missing.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npm run test
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Collection.tsx
git commit -m "feat: add edit mode and remove-cards quantity stepper to Collection"
```

---

### Task 5: Smoke test in browser

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual test — edit mode**
  1. Open `http://localhost:5173`, log in.
  2. Open a few packs so you have duplicate cards.
  3. Go to Collection — confirm "Edit" button in header.
  4. Click "Edit" — confirm red × badges appear on all cards.
  5. Click a card — quantity stepper modal opens.
  6. Adjust quantity with +/− — confirm clamped to [1, count].
  7. Click "Remove" — modal closes, card count updates (or card disappears if all removed).
  8. Click "Done" — badges disappear, click card opens detail modal.

- [ ] **Step 3: Manual test — detail modal remove**
  1. With edit mode off, click a card.
  2. Confirm "Remove" button in detail modal.
  3. Click Remove — stepper modal opens.
  4. Confirm and remove.

- [ ] **Step 4: Manual test — error path (optional)**
  Disable network in DevTools, try to remove — confirm state reverts and alert appears.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: remove cards — complete implementation"
```

# Remove Cards — Design Spec

**Date:** 2026-06-07  
**Status:** Approved

## Overview

Allow users to remove cards from their collection via edit mode in the Collection view, with quantity control. No currency refund at this stage (deferred to marketplace phase).

## Entry Points

1. **Collection grid** — "Edit" toggle button in collection header. Activates edit mode.
2. **Card detail modal** — "Remove" button opens quantity stepper modal directly.

## Edit Mode

- Header gains "Edit" / "Done" toggle button (secondary style, right side).
- When active:
  - Red × badge appears top-right of each `.collection__slot`.
  - Clicking a card slot opens the quantity stepper modal (not the detail modal).
- When inactive: normal click-to-detail behavior restored.

## Quantity Stepper Modal

- Shows: card image (sm), card name, set/number, current owned count.
- −/+ buttons to select quantity to remove, clamped to [1, count].
- "Remove" confirm button. "Cancel" closes modal.
- On confirm: optimistic update → Supabase call → revert on error.

## Data Layer

### AppContext action
```ts
{ type: 'REMOVE_CARD'; cardId: string; quantity: number }
```
Reducer logic:
- If `quantity >= entry.count`: remove entry from `collection[]`.
- Else: decrement `entry.count` by `quantity`.

### Query — `lib/queries.ts`
```ts
removeFromCollection(userId: string, cardId: string, quantity: number): Promise<void>
```
- Fetch current count from `user_collection`.
- If `quantity >= count`: delete row.
- Else: `UPDATE user_collection SET count = count - quantity WHERE user_id = $1 AND card_id = $2`.

No RPC needed — two simple queries, non-atomic is acceptable (no currency involved).

## Error Handling

On Supabase failure: revert AppContext state via `SET_COLLECTION` with prior snapshot. Show brief error toast (reuse any existing error display pattern, or plain `alert` if none exists yet).

## Out of Scope

- Currency refund (marketplace phase)
- Bulk multi-select delete
- Undo / soft delete

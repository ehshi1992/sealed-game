# sealed-game — Claude Context

## Project
Pokémon TCG pack-opening web app. Vite + React 19 (CSR) + React Router v7 + Supabase + pure CSS holo effect. Deployed to Vercel.

## Stack
- **Frontend**: Vite, React 19, React Router v7, TypeScript, pure CSS
- **Backend**: Supabase (Postgres + Auth + Edge Functions)
- **Deploy**: Vercel (SPA rewrite in `vercel.json`)
- **Tests**: Vitest + React Testing Library

## Commands
```bash
npm run dev        # start dev server (localhost:5173)
npm run build      # production build
npm run test       # vitest
npm run seed       # seed cards + packs from pokemontcg.io API
npx supabase functions deploy open-pack --project-ref gcwqxxnaccxjmrndowbu
npx supabase db push  # apply migrations
```

## Supabase Project
- **Project ref**: `gcwqxxnaccxjmrndowbu`
- **URL**: `https://gcwqxxnaccxjmrndowbu.supabase.co`
- **Migrations**: `supabase/migrations/` — push with `npx supabase db push`
- **Edge function**: `supabase/functions/open-pack/` — server-side RNG, pack opening, currency deduction

## Key Architecture Decisions
- **No Framer Motion, Zustand, React Query** — minimal deps by design
- **React 19 primitives**: `useOptimistic`, `useActionState`, `use()` + Suspense, `startTransition`
- **Holo effect**: WebGL fragment shader (`useHoloShader`) samples a greyscale bitmap (`public/textures/cosmo-bitmap.png`, 512×715) extracted from real cosmo foil reference photos. Two UV layers activate 180° apart in tilt space, creating a wave shimmer. Canvas bleeds 12px beyond card edge (`overflow: visible` on `.card`, `clip-path` on other layers). CSS holo/sparkle/glare layers are retained for non-cosmo holo types. Bitmap regenerated via `scripts/extract-holo-bitmap.ts`.
- **Auth**: Google OAuth + magic link via Supabase Auth
- **Currency**: integer stored in `profiles.currency`, mutated atomically via `increment_currency` RPC (security definer)
- **Pack opening**: always goes through edge function (anti-cheat server-side RNG)
- **Collection state**: all mutations (remove, binder move) use optimistic dispatch → await query → revert on catch pattern. `reducer` exported from `AppContext.tsx` and imported directly in tests (no duplication).
- **Binders**: physical simulation — one card, one location. `binder_id = null` → bulk. `ON DELETE SET NULL` handles DB cascade. Drag-and-drop uses native HTML5 (no dnd-kit).

## UI Components

### ParticleBurst
- **Location**: `src/components/ParticleBurst/ParticleBurst.tsx`
- **Props**: `{ x: number, y: number, active: boolean }`
- **What it does**: full-viewport `<canvas>` (fixed, z-index 100, pointer-events none) that runs a 60-frame RAF loop emitting 40 gold particles from `(x, y)` with gravity. Auto-cleans up on unmount. Triggered in PackRip when a `secret_rare` or `ultra_rare` card is flipped.

### Animate.css
- Loaded via CDN in `index.html` — no npm package. Used for miscellaneous entrance animations where a quick utility class is simpler than a keyframe.

### Card flip sizing
- `.card-flip` is **120×167px** with `perspective: 800px`. Inner HoloCard uses `size="sm"`. Do not change to `size="md"` — it overflows the slot.

### Rare card glow
- `.pack-rip__card-slot--rare` overrides the normal `card-reveal` animation with `card-reveal-rare` — a gold `drop-shadow` pulse. Applied when `card.rarity === 'secret_rare' || 'ultra_rare'`.

### BinderPanel
- **Location**: `src/components/BinderPanel/BinderPanel.tsx`
- **Props**: `{ binders, collection, draggedEntryId, onDragStart, onMoveCard, onCreateBinder, onDeleteBinder }`
- **Views**: list view (binder rows with color swatch, count, delete) ↔ binder view (3×3 card grid, pagination)
- **State**: `selectedBinderId: string | null` (null = list view), `showCreateForm`, `newName`, `newColor`, `page`, `isDragOver`
- **Drag-and-drop**: native HTML5. Binder view: full panel is drop zone. Cards in binder are draggable back to bulk.
- **Card sizing**: `.binder-panel__slot .card { width: 100%; height: 100% }` overrides fixed `card--sm` (120×167px) to fit slot. Slot uses `aspect-ratio: 63/88`.
- **Opened via**: "Binders" toggle button in Collection header.

### Collection — Remove Cards
- **Edit mode**: toggled via "Edit" button. In edit mode, clicking a card slot opens stepper modal. Red × badge overlays each card.
- **Stepper modal**: shows card, count you own, −/+ quantity buttons, "Remove N / all" confirm. Optimistic dispatch → revert on failure.

### PolygonTest (dev route)
- **Location**: `src/routes/PolygonTest.tsx` — accessible at `/polygon-test`
- **Purpose**: Visual validation of subject polygon extraction for holo shader masking
- **Data**: Fetches `/polygon-test-data/{card_id}.json` (static files in `public/polygon-test-data/`, 6 Neo Genesis cards pre-computed)
- **Controls**: toggle polygon overlay, toggle holo-preview (hue tracks pointer)
- **Pattern**: mirrors HoloTest — dark bg, monospace, 300×418 cards, SVG `<polygon>` overlay

### Global CSS
- `.spinner` class exists in global CSS for loading states.
- `.btn--sm` / `.btn--xs`: compact button size modifiers (no inline styles needed).
- `.btn--danger`: red destructive button.

## Scripts (Python)

### extract_subject_polygons.py
- **Purpose**: one-off — segments Pokémon subject from card art, outputs normalized polygon JSON
- **Deps**: `scripts/requirements-polygon.txt` (`pip install -r scripts/requirements-polygon.txt`)
- **Usage**: `python scripts/extract_subject_polygons.py <card_id> [--all] [--debug] [--epsilon 0.02] [--output-dir output]`
- **Skip**: trainer + energy cards (via `card_layout_type`)
- **Output**: `output/polygons/{card_id}.json` — `{card_id, polygon: [[x,y],...], metrics}`
- **Debug**: `--debug` writes `output/debug-sheet.png` (3-panel grid: original | alpha mask | polygon overlay)
- **Future**: persist to `cards.subject_polygon jsonb`, constrain holo shader pattern to subject

## Known Issues / Gotchas
- **Supabase new key format**: `sb_publishable_` / `sb_secret_` keys are auto-injected into edge functions. Use `npm:@supabase/supabase-js@2` import (not esm.sh) in Deno edge functions.
- **`auth.getUser()` in edge functions**: must pass JWT explicitly — `serviceClient.auth.getUser(token)` where `token = authHeader.replace('Bearer ', '')`. The parameterless form doesn't work in Deno.
- **`SUPABASE_SERVICE_ROLE_KEY`** prefix `SUPABASE_` is reserved — cannot set via `supabase secrets set`. It's auto-injected by Supabase runtime.
- **Vite env vars**: `import.meta.env.VITE_*` only. Non-`VITE_` vars not exposed to frontend. `.env.local` is gitignored.
- **Seed script**: uses `dotenv` with `path: '.env.local'` (not default `.env`).
- **`handle_new_user` trigger**: creates profile on auth signup. May not fire for OAuth on first login — edge function has upsert guard.
- **`packsPromise` in Shop.tsx**: created at module level (outside component) — intentional for `use()` + Suspense pattern.
- **`.pack-rip__pack` height**: must be explicit (280px) — both images are `position: absolute; inset: 0` so the parent collapses to 0 without it.

## Database Schema
- `profiles` — `id` (FK auth.users), `username`, `currency int default 100`
- `cards` — `id`, `name`, `set`, `number`, `rarity`, `image_url`, `holo_type`; unique on `(set, number)`
- `packs` — `id`, `name`, `price`, `image_url`, `card_pool uuid[]`
- `user_collection` — `user_id`, `card_id`, `acquired_at`, `count`, `binder_id` (FK binders, ON DELETE SET NULL)
- `binders` — `id`, `user_id` (FK profiles), `name`, `color`, `created_at`
- `transactions` — `user_id`, `type` (pack_purchase|daily_reward), `amount`, `created_at`

## RLS
- `profiles`: owner only (all ops)
- `cards`, `packs`: public read
- `user_collection`: owner select only
- `binders`: owner all ops
- `transactions`: owner select + insert

## Env vars (.env.local — never commit)
```
VITE_SUPABASE_URL=https://gcwqxxnaccxjmrndowbu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # JWT format (legacy), not sb_publishable_
VITE_SUPABASE_DB_PASSWORD=...
POKEMONTCG_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=eyJ... # JWT format (legacy), not sb_secret_
```

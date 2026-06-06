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
- **Holo effect**: pure CSS via `mix-blend-mode: color-dodge/overlay` + `repeating-linear-gradient`, updated on mousemove via `element.style.setProperty()`
- **Auth**: Google OAuth + magic link via Supabase Auth
- **Currency**: integer stored in `profiles.currency`, mutated atomically via `increment_currency` RPC (security definer)
- **Pack opening**: always goes through edge function (anti-cheat server-side RNG)

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

### Global CSS
- `.spinner` class exists in global CSS for loading states.

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
- `user_collection` — `user_id`, `card_id`, `acquired_at`, `count`
- `transactions` — `user_id`, `type` (pack_purchase|daily_reward), `amount`, `created_at`

## RLS
- `profiles`: owner only (all ops)
- `cards`, `packs`: public read
- `user_collection`: owner select only
- `transactions`: owner select + insert

## Env vars (.env.local — never commit)
```
VITE_SUPABASE_URL=https://gcwqxxnaccxjmrndowbu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # JWT format (legacy), not sb_publishable_
VITE_SUPABASE_DB_PASSWORD=...
POKEMONTCG_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=eyJ... # JWT format (legacy), not sb_secret_
```

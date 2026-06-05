# Sealed Game — MVP Design Spec
**Date:** 2026-06-05

## Overview

A web-first CSR app where users rip open virtual Pokémon card packs, collect cards, and view them with a rich holographic parallax effect. MVP focuses entirely on the pack opening experience.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 19 (TypeScript, CSR only) |
| Routing | React Router v7 |
| Backend | Supabase (Auth + Postgres + Storage + Edge Functions) |
| Deployment | Vercel (frontend), Supabase (backend) |
| Animations | Pure CSS (custom properties, keyframes, mix-blend-mode) |
| State | useReducer + Context, useOptimistic, use() + Suspense |
| Libraries | `@supabase/supabase-js`, `react-router-dom` only |

No Framer Motion, no Zustand, no React Query. React 19 primitives cover all state/data needs.

---

## Project Structure

```
sealed-game/
├── src/
│   ├── routes/
│   │   ├── Home.tsx
│   │   ├── Shop.tsx
│   │   ├── PackOpening.tsx
│   │   └── Collection.tsx
│   ├── components/
│   │   ├── HoloCard/
│   │   ├── PackRip/
│   │   └── ui/
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── queries.ts
│   ├── hooks/
│   │   ├── useCollection.ts
│   │   ├── useCurrency.ts
│   │   └── useAuth.ts
│   └── styles/
│       ├── global.css
│       └── holo.css
├── supabase/
│   └── functions/
│       └── open-pack/
│           └── index.ts
└── docs/
```

---

## Database Schema

```sql
-- Auth handled by Supabase Auth (auth.users)

profiles
  id          uuid references auth.users primary key
  username    text
  currency    integer default 100

cards
  id          uuid primary key
  name        text
  set         text
  number      text
  rarity      text  -- common | uncommon | rare | holo_rare | ultra_rare | secret_rare
  image_url   text
  holo_type   text  -- none | standard | reverse | full_art | rainbow

packs
  id          uuid primary key
  name        text
  price       integer
  image_url   text
  card_pool   uuid[]

user_collection
  id          uuid primary key
  user_id     uuid references profiles
  card_id     uuid references cards
  acquired_at timestamptz default now()
  count       integer default 1

transactions
  id          uuid primary key
  user_id     uuid references profiles
  type        text  -- pack_purchase | daily_reward
  amount      integer
  created_at  timestamptz default now()
```

RLS locks every table to `auth.uid() = user_id`. Edge Function uses service role key to write pack results authoritatively.

Card data seeded from pokemontcg.io free API (images, rarity, set metadata).

---

## Pack Opening Flow

1. User clicks "Open Pack" → currency deducted optimistically via `useOptimistic`
2. POST to `supabase.functions.invoke('open-pack', { packId })`
3. Edge Function:
   - Validates currency balance
   - Deducts currency atomically
   - Rolls RNG against rarity weights: common 60%, uncommon 25%, rare 10%, holo_rare 4%, ultra_rare/secret_rare 1%
   - Pack size: 10 cards per pack (1 guaranteed rare or better)
   - Selects cards from pack's `card_pool`
   - Writes results to `user_collection`
   - Returns card array
4. Client receives cards → triggers animation sequence

### Animation Sequence

```
idle pack → hover shimmer
→ click: pack shake (CSS keyframes)
→ tear: clip-path reveal animation
→ cards fan out face-down
→ tap each card: CSS perspective rotateY flip
→ on flip: holo effect activates per rarity
→ "Add to collection" → navigate to /collection
```

---

## HoloCard Component

### DOM Structure

```html
<div class="card" data-holo-type="rainbow"
     style="--rotateX: 5deg; --rotateY: -3deg; --bgX: 52%; --bgY: 48%">
  <div class="card__translucent"></div>
  <img class="card__img" />
  <div class="card__holo"></div>
  <div class="card__sparkle"></div>
  <div class="card__glare"></div>
</div>
```

### Interaction

- Desktop: `onMouseMove` updates CSS vars `--rotateX`, `--rotateY`, `--bgX`, `--bgY`, `--mx`, `--my`
- Mobile: `onTouchMove` — same vars
- `onMouseLeave` / `onTouchEnd` — CSS transition snaps back to neutral
- No JS animation libraries; CSS custom properties updated via `element.style.setProperty()`

### Holo Layers (all `position: absolute`, `pointer-events: none`)

- `card__holo`: `repeating-linear-gradient` + `mix-blend-mode: color-dodge`, opacity driven by `--pointer-from-center`
- `card__sparkle`: noise texture + `mix-blend-mode: color-dodge` + animated `background-position`
- `card__glare`: radial gradient at `--mx/my` + `mix-blend-mode: overlay`

### Rarity → Holo Type Mapping

| Rarity | Holo Type | Effect |
|---|---|---|
| common | none | No effect |
| uncommon | none | No effect |
| rare | standard | Subtle shimmer |
| holo_rare | standard | Rainbow shimmer |
| ultra_rare | full_art | Full shimmer + sparkle |
| secret_rare | rainbow | Rainbow + animated shimmer + heavy sparkle |

Driven by `data-holo-type` attribute + CSS `[data-holo-type="rainbow"] .card__holo { ... }` selectors.

---

## Routes & Screens

| Route | Screen |
|---|---|
| `/` | Home — auth gate, redirects to `/shop` if logged in |
| `/shop` | Pack shop, currency balance, purchase packs |
| `/pack-opening` | Full-screen pack rip + card reveal sequence |
| `/collection` | Card grid, click card → HoloCard detail view |

### Global State

```ts
type AppState = {
  user: User | null
  currency: number
  collection: CollectionEntry[]
}
```

- `useReducer` + Context for global state
- `useOptimistic` for currency deduction
- `use()` + Suspense for data fetching
- Local `useState` for pack opening animation phases

### Daily Currency

Supabase `pg_cron` job grants currency daily. Client checks on login, shows unclaimed reward button.

---

## Auth

Supabase Auth: Google OAuth + email magic link. Session via `supabase.auth.getSession()`. No auth library.

---

## MVP Scope

**In:**
- User auth (Google + magic link)
- Currency (starting balance + daily grant)
- Shop with pack listings
- Pack opening (Edge Function RNG + animation)
- Collection view
- HoloCard with parallax + rarity-based holo effect

**Out (post-MVP):**
- Trading between users
- Deck building
- Real money / Stripe
- Leaderboards
- Push notifications
- Custom card sets (non-Pokémon)

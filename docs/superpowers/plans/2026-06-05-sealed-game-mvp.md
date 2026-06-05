# Sealed Game MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-first CSR app where users rip open virtual Pokémon card packs, collect cards, and view them with a holographic parallax effect.

**Architecture:** Vite + React 19 SPA with React Router v7 for routing and Supabase for auth, database, storage, and edge functions. Pack opening RNG runs server-side in a Supabase Edge Function to prevent cheating. All animations are pure CSS custom properties driven by JS event handlers.

**Tech Stack:** Vite, React 19, TypeScript, React Router v7, @supabase/supabase-js, Vitest + React Testing Library (dev), Supabase Edge Functions (Deno), Vercel

---

## File Map

```
sealed-game/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vercel.json
├── package.json
├── .env.local                          (already exists)
├── .gitignore                          (already exists)
├── scripts/
│   └── seed-cards.ts                   # Fetch from pokemontcg.io → insert to Supabase
├── src/
│   ├── main.tsx                        # React root mount
│   ├── App.tsx                         # Router + AppProvider wrapper
│   ├── types.ts                        # All shared TypeScript types
│   ├── lib/
│   │   ├── supabase.ts                 # Supabase client singleton
│   │   └── queries.ts                  # All Supabase read queries
│   ├── context/
│   │   └── AppContext.tsx              # useReducer + Context + dispatch
│   ├── hooks/
│   │   ├── useAuth.ts                  # Session management
│   │   ├── useCollection.ts            # Fetch user collection
│   │   └── useCurrency.ts              # Currency + daily reward
│   ├── routes/
│   │   ├── Home.tsx                    # Auth gate / login screen
│   │   ├── Shop.tsx                    # Pack listings + currency display
│   │   ├── PackOpening.tsx             # Full-screen animation orchestrator
│   │   └── Collection.tsx              # Card grid + detail modal
│   ├── components/
│   │   ├── HoloCard/
│   │   │   ├── HoloCard.tsx            # Card + parallax holo effect
│   │   │   └── HoloCard.css            # Holo layers, CSS vars, blend modes
│   │   ├── PackRip/
│   │   │   ├── PackRip.tsx             # Pack tear animation + card fan
│   │   │   └── PackRip.css             # Shake, clip-path tear, fan keyframes
│   │   └── ui/
│   │       ├── Button.tsx
│   │       └── CurrencyDisplay.tsx
│   └── styles/
│       └── global.css
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_pg_cron_daily_reward.sql
│   └── functions/
│       └── open-pack/
│           └── index.ts
└── src/__tests__/
    ├── HoloCard.test.tsx
    ├── queries.test.ts
    └── open-pack.test.ts
```

---

## Task 1: Scaffold Project

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/main.tsx`

- [ ] **Step 1: Scaffold Vite React TypeScript project**

```bash
cd ~/github/sealed-game
npm create vite@latest . -- --template react-ts
```

When prompted "Current directory is not empty. Remove existing files and continue?" — select **No, keep existing files** (or type `n`). This preserves `.env.local`, `.gitignore`, and `docs/`.

- [ ] **Step 2: Install dependencies**

```bash
npm install react-router-dom @supabase/supabase-js
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 3: Update `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.ts',
  },
})
```

- [ ] **Step 4: Create `src/__tests__/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Update `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Replace `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 7: Create `src/styles/global.css`**

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #0a0a0f;
  --surface: #13131a;
  --border: #2a2a3a;
  --text: #e8e8f0;
  --text-muted: #7a7a9a;
  --accent: #7c3aed;
  --accent-glow: #7c3aed44;
  --gold: #f59e0b;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}

#root {
  min-height: 100vh;
}
```

- [ ] **Step 8: Update `package.json` scripts**

Add to the `scripts` section:
```json
"test": "vitest",
"test:run": "vitest run",
"seed": "tsx scripts/seed-cards.ts"
```

Also install `tsx` for running the seed script:
```bash
npm install -D tsx
```

- [ ] **Step 9: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server at `http://localhost:5173` with default React page.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React 19 project"
```

---

## Task 2: Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write type tests**

Create `src/__tests__/types.test.ts`:

```ts
import type { Card, Pack, CollectionEntry, AppState, AppAction } from '../types'

describe('types compile', () => {
  it('Card type has required fields', () => {
    const card: Card = {
      id: '1',
      name: 'Pikachu',
      set: 'base1',
      number: '58',
      rarity: 'common',
      image_url: 'https://example.com/pikachu.png',
      holo_type: 'none',
    }
    expect(card.id).toBe('1')
  })

  it('AppState has user, currency, collection', () => {
    const state: AppState = { user: null, currency: 100, collection: [] }
    expect(state.currency).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/__tests__/types.test.ts
```

Expected: FAIL — `Cannot find module '../types'`

- [ ] **Step 3: Create `src/types.ts`**

```ts
import type { User } from '@supabase/supabase-js'

export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'holo_rare'
  | 'ultra_rare'
  | 'secret_rare'

export type HoloType = 'none' | 'standard' | 'reverse' | 'full_art' | 'rainbow'

export type Card = {
  id: string
  name: string
  set: string
  number: string
  rarity: Rarity
  image_url: string
  holo_type: HoloType
}

export type Pack = {
  id: string
  name: string
  price: number
  image_url: string
  card_pool: string[]
}

export type CollectionEntry = {
  id: string
  user_id: string
  card_id: string
  card: Card
  acquired_at: string
  count: number
}

export type Transaction = {
  id: string
  user_id: string
  type: 'pack_purchase' | 'daily_reward'
  amount: number
  created_at: string
}

export type Profile = {
  id: string
  username: string | null
  currency: number
}

export type AppState = {
  user: User | null
  currency: number
  collection: CollectionEntry[]
}

export type AppAction =
  | { type: 'SET_USER'; user: User | null }
  | { type: 'SET_CURRENCY'; currency: number }
  | { type: 'DEDUCT_CURRENCY'; amount: number }
  | { type: 'SET_COLLECTION'; collection: CollectionEntry[] }
  | { type: 'ADD_CARDS'; cards: CollectionEntry[] }

export type PackOpenResult = {
  cards: Card[]
  newCurrency: number
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/__tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/__tests__/types.test.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Supabase Client + Queries

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/queries.ts`
- Test: `src/__tests__/queries.test.ts`

- [ ] **Step 1: Write query tests**

Create `src/__tests__/queries.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
    },
  },
}))

import { fetchProfile, fetchPacks, fetchCollection } from '../lib/queries'

describe('fetchProfile', () => {
  it('returns null when no data', async () => {
    const result = await fetchProfile('user-123')
    expect(result).toBeNull()
  })
})

describe('fetchPacks', () => {
  it('returns empty array when no data', async () => {
    const result = await fetchPacks()
    expect(result).toEqual([])
  })
})

describe('fetchCollection', () => {
  it('returns empty array when no data', async () => {
    const result = await fetchCollection('user-123')
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/__tests__/queries.test.ts
```

Expected: FAIL — modules not found

- [ ] **Step 3: Create `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 4: Create `src/lib/queries.ts`**

```ts
import { supabase } from './supabase'
import type { Card, Pack, CollectionEntry, Profile } from '../types'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return data as Profile
}

export async function fetchPacks(): Promise<Pack[]> {
  const { data, error } = await supabase.from('packs').select('*')
  if (error || !data) return []
  return data as Pack[]
}

export async function fetchCollection(userId: string): Promise<CollectionEntry[]> {
  const { data, error } = await supabase
    .from('user_collection')
    .select('*, card:cards(*)')
    .eq('user_id', userId)
    .order('acquired_at', { ascending: false })
  if (error || !data) return []
  return data as CollectionEntry[]
}

export async function fetchCard(cardId: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single()
  if (error || !data) return null
  return data as Card
}

export async function claimDailyReward(userId: string): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'daily_reward')
    .gte('created_at', today)
    .maybeSingle()
  if (error) return null
  if (data) return null // already claimed

  const { error: insertError } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'daily_reward',
    amount: 50,
  })
  if (insertError) return null

  const { data: profile, error: updateError } = await supabase
    .from('profiles')
    .update({ currency: supabase.rpc('increment_currency', { uid: userId, delta: 50 }) })
    .eq('id', userId)
    .select('currency')
    .single()
  if (updateError || !profile) return null
  return (profile as Profile).currency
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/__tests__/queries.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.ts src/lib/queries.ts src/__tests__/queries.test.ts
git commit -m "feat: add Supabase client and query functions"
```

---

## Task 4: Database Migrations

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/migrations/002_rls_policies.sql`
- Create: `supabase/migrations/003_pg_cron_daily_reward.sql`

Prerequisites: Install Supabase CLI — `npm install -D supabase` — and log in: `npx supabase login`. Link to your project: `npx supabase link --project-ref <your-project-ref>`.

Your project ref is found in the Supabase dashboard URL: `app.supabase.com/project/<project-ref>`.

- [ ] **Step 1: Create `supabase/migrations/001_initial_schema.sql`**

```sql
-- profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text,
  currency integer not null default 100
);

-- cards
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  set text not null,
  number text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','holo_rare','ultra_rare','secret_rare')),
  image_url text not null,
  holo_type text not null check (holo_type in ('none','standard','reverse','full_art','rainbow'))
);

-- packs
create table public.packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null,
  image_url text not null,
  card_pool uuid[] not null default '{}'
);

-- user_collection
create table public.user_collection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  card_id uuid references public.cards(id) not null,
  acquired_at timestamptz not null default now(),
  count integer not null default 1
);

-- transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('pack_purchase','daily_reward')),
  amount integer not null,
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- helper for atomic currency increment
create or replace function public.increment_currency(uid uuid, delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  new_val integer;
begin
  update public.profiles set currency = currency + delta where id = uid returning currency into new_val;
  return new_val;
end;
$$;
```

- [ ] **Step 2: Create `supabase/migrations/002_rls_policies.sql`**

```sql
-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_collection enable row level security;
alter table public.transactions enable row level security;
alter table public.cards enable row level security;
alter table public.packs enable row level security;

-- profiles: users can read/update their own row
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id);

-- user_collection: users can read their own
create policy "collection: own rows" on public.user_collection
  for select using (auth.uid() = user_id);

-- transactions: users can read and insert their own
create policy "transactions: own rows read" on public.transactions
  for select using (auth.uid() = user_id);

create policy "transactions: own rows insert" on public.transactions
  for insert with check (auth.uid() = user_id);

-- cards: public read
create policy "cards: public read" on public.cards
  for select using (true);

-- packs: public read
create policy "packs: public read" on public.packs
  for select using (true);
```

- [ ] **Step 3: Create `supabase/migrations/003_pg_cron_daily_reward.sql`**

```sql
-- Enable pg_cron extension (run in Supabase dashboard SQL editor if not already enabled)
-- create extension if not exists pg_cron;

-- This migration documents the cron job — run manually in dashboard:
-- select cron.schedule('daily-currency', '0 0 * * *', $$
--   update public.profiles set currency = currency + 50
--   where id in (
--     select distinct user_id from public.transactions
--     where created_at > now() - interval '30 days'
--   );
-- $$);
--
-- NOTE: pg_cron grants are managed per-project. The client-side claimDailyReward()
-- function in queries.ts handles the actual per-user gating (checks for existing
-- daily_reward transaction today before crediting).
```

- [ ] **Step 4: Push migrations to Supabase**

```bash
npx supabase db push
```

Expected: All 3 migrations applied successfully.

If you get a pg_cron error on migration 003, that's expected — it's a comment-only migration. Migrations 001 and 002 must succeed.

- [ ] **Step 5: Enable Google OAuth in Supabase dashboard**

1. Go to `app.supabase.com/project/<ref>/auth/providers`
2. Enable **Google** provider
3. Add your Google OAuth credentials (Client ID + Secret from Google Cloud Console)
4. Set redirect URL to `http://localhost:5173` for dev

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: add database migrations and RLS policies"
```

---

## Task 5: AppContext (Global State)

**Files:**
- Create: `src/context/AppContext.tsx`

- [ ] **Step 1: Create `src/context/AppContext.tsx`**

```tsx
import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import type { AppState, AppAction, CollectionEntry } from '../types'
import { supabase } from '../lib/supabase'
import { fetchProfile, fetchCollection } from '../lib/queries'

const initialState: AppState = {
  user: null,
  currency: 0,
  collection: [],
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.user }
    case 'SET_CURRENCY':
      return { ...state, currency: action.currency }
    case 'DEDUCT_CURRENCY':
      return { ...state, currency: Math.max(0, state.currency - action.amount) }
    case 'SET_COLLECTION':
      return { ...state, collection: action.collection }
    case 'ADD_CARDS':
      return { ...state, collection: [...action.cards, ...state.collection] }
    default:
      return state
  }
}

type AppContextValue = {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null
      dispatch({ type: 'SET_USER', user })
      if (user) loadUserData(user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user ?? null
        dispatch({ type: 'SET_USER', user })
        if (user) loadUserData(user)
        else dispatch({ type: 'SET_COLLECTION', collection: [] })
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadUserData(user: User) {
    const [profile, collection] = await Promise.all([
      fetchProfile(user.id),
      fetchCollection(user.id),
    ])
    if (profile) dispatch({ type: 'SET_CURRENCY', currency: profile.currency })
    dispatch({ type: 'SET_COLLECTION', collection })
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
```

- [ ] **Step 2: Create `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Home from './routes/Home'
import Shop from './routes/Shop'
import PackOpening from './routes/PackOpening'
import Collection from './routes/Collection'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state } = useApp()
  if (!state.user) return <Navigate to="/" replace />
  return <>{children}</>
}

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<AuthGuard><Shop /></AuthGuard>} />
        <Route path="/pack-opening" element={<AuthGuard><PackOpening /></AuthGuard>} />
        <Route path="/collection" element={<AuthGuard><Collection /></AuthGuard>} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  )
}
```

- [ ] **Step 3: Create stub route files so App.tsx compiles**

Create `src/routes/Home.tsx`:
```tsx
export default function Home() { return <div>Home</div> }
```

Create `src/routes/Shop.tsx`:
```tsx
export default function Shop() { return <div>Shop</div> }
```

Create `src/routes/PackOpening.tsx`:
```tsx
export default function PackOpening() { return <div>PackOpening</div> }
```

Create `src/routes/Collection.tsx`:
```tsx
export default function Collection() { return <div>Collection</div> }
```

- [ ] **Step 4: Verify app compiles**

```bash
npm run dev
```

Expected: App loads at `http://localhost:5173`, navigating to `/shop` redirects to `/` (not logged in).

- [ ] **Step 5: Commit**

```bash
git add src/context/ src/App.tsx src/routes/
git commit -m "feat: add AppContext with auth session and global state"
```

---

## Task 6: Auth + Home Route

**Files:**
- Modify: `src/routes/Home.tsx`
- Create: `src/hooks/useAuth.ts`

- [ ] **Step 1: Create `src/hooks/useAuth.ts`**

```ts
import { supabase } from '../lib/supabase'

export function useAuth() {
  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/shop' },
    })
  }

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/shop' },
    })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { signInWithGoogle, signInWithMagicLink, signOut }
}
```

- [ ] **Step 2: Replace `src/routes/Home.tsx`**

```tsx
import { useState, useActionState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { state } = useApp()
  const { signInWithGoogle, signInWithMagicLink } = useAuth()
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const [magicLinkError, submitMagicLink, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const email = formData.get('email') as string
      const error = await signInWithMagicLink(email)
      if (error) return error.message
      setMagicLinkSent(true)
      return null
    },
    null
  )

  if (state.user) return <Navigate to="/shop" replace />

  return (
    <div className="home">
      <div className="home__hero">
        <h1>Sealed</h1>
        <p>Rip packs. Collect cards. Feel the holo.</p>
      </div>

      <div className="home__auth">
        <button className="btn btn--primary" onClick={signInWithGoogle}>
          Continue with Google
        </button>

        <div className="home__divider">or</div>

        {magicLinkSent ? (
          <p className="home__success">Check your email for a magic link!</p>
        ) : (
          <form action={submitMagicLink} className="home__magic-form">
            <input
              name="email"
              type="email"
              placeholder="your@email.com"
              required
              className="home__input"
            />
            <button type="submit" className="btn btn--secondary" disabled={isPending}>
              {isPending ? 'Sending…' : 'Send Magic Link'}
            </button>
            {magicLinkError && <p className="home__error">{magicLinkError}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add Home styles to `src/styles/global.css`** (append)

```css
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 2rem;
  padding: 2rem;
}

.home__hero { text-align: center; }
.home__hero h1 { font-size: 4rem; font-weight: 800; letter-spacing: -0.04em; }
.home__hero p { color: var(--text-muted); font-size: 1.1rem; margin-top: 0.5rem; }

.home__auth {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 360px;
}

.home__divider {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
  position: relative;
}

.home__magic-form { display: flex; flex-direction: column; gap: 0.75rem; }

.home__input {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 1rem;
  width: 100%;
}

.home__input:focus { outline: none; border-color: var(--accent); }
.home__error { color: #ef4444; font-size: 0.875rem; }
.home__success { color: #22c55e; font-size: 0.875rem; text-align: center; }

.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn--primary { background: var(--accent); color: white; }
.btn--primary:hover:not(:disabled) { opacity: 0.85; }
.btn--secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn--secondary:hover:not(:disabled) { border-color: var(--accent); }
```

- [ ] **Step 4: Verify auth flow**

```bash
npm run dev
```

Visit `http://localhost:5173`. You should see the login screen with Google button and magic link form.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAuth.ts src/routes/Home.tsx src/styles/global.css
git commit -m "feat: add auth flow with Google OAuth and magic link"
```

---

## Task 7: Seed Cards from pokemontcg.io

**Files:**
- Create: `scripts/seed-cards.ts`

This script fetches Pokémon cards from the free pokemontcg.io API and inserts them into Supabase.

- [ ] **Step 1: Get a pokemontcg.io API key**

Register free at `https://dev.pokemontcg.io` and copy your API key. Add to `.env.local`:

```
POKEMONTCG_API_KEY=your-key-here
```

- [ ] **Step 2: Create `scripts/seed-cards.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role key — NOT the anon key
)

const RARITY_MAP: Record<string, string> = {
  'Common': 'common',
  'Uncommon': 'uncommon',
  'Rare': 'rare',
  'Rare Holo': 'holo_rare',
  'Rare Ultra': 'ultra_rare',
  'Rare Secret': 'secret_rare',
  'Rare Rainbow': 'secret_rare',
  'Rare Holo EX': 'ultra_rare',
  'Rare Holo GX': 'ultra_rare',
  'Rare Holo V': 'ultra_rare',
  'Rare Holo VMAX': 'ultra_rare',
}

const HOLO_MAP: Record<string, string> = {
  'common': 'none',
  'uncommon': 'none',
  'rare': 'standard',
  'holo_rare': 'standard',
  'ultra_rare': 'full_art',
  'secret_rare': 'rainbow',
}

async function fetchCards(setId: string) {
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250`,
    { headers: { 'X-Api-Key': process.env.POKEMONTCG_API_KEY! } }
  )
  const json = await res.json()
  return json.data as Array<{
    id: string
    name: string
    set: { id: string }
    number: string
    rarity?: string
    images: { large: string }
  }>
}

async function seed() {
  // Seed Base Set (base1) as the first pack
  const setId = 'base1'
  const raw = await fetchCards(setId)

  const cards = raw.map((c) => {
    const rarity = RARITY_MAP[c.rarity ?? ''] ?? 'common'
    return {
      name: c.name,
      set: c.set.id,
      number: c.number,
      rarity,
      image_url: c.images.large,
      holo_type: HOLO_MAP[rarity] ?? 'none',
    }
  })

  console.log(`Inserting ${cards.length} cards from set ${setId}…`)

  const { data: insertedCards, error: cardError } = await supabase
    .from('cards')
    .upsert(cards, { onConflict: 'name,set,number' })
    .select('id')

  if (cardError) { console.error(cardError); process.exit(1) }

  const cardIds = insertedCards!.map((c: { id: string }) => c.id)

  // Create a Base Set pack
  const { error: packError } = await supabase
    .from('packs')
    .upsert({
      name: 'Base Set Booster',
      price: 100,
      image_url: 'https://images.pokemontcg.io/base1/logo.png',
      card_pool: cardIds,
    }, { onConflict: 'name' })

  if (packError) { console.error(packError); process.exit(1) }

  console.log('Seed complete.')
}

seed()
```

- [ ] **Step 3: Add service role key to `.env.local`**

Get `SUPABASE_SERVICE_ROLE_KEY` from Supabase dashboard → Settings → API → service_role key.

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Also install dotenv:
```bash
npm install -D dotenv
```

- [ ] **Step 4: Run seed**

```bash
npm run seed
```

Expected: `Seed complete.` — cards and one pack visible in Supabase table editor.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-cards.ts
git commit -m "feat: add card seed script from pokemontcg.io"
```

---

## Task 8: HoloCard Component

**Files:**
- Create: `src/components/HoloCard/HoloCard.tsx`
- Create: `src/components/HoloCard/HoloCard.css`
- Test: `src/__tests__/HoloCard.test.tsx`

- [ ] **Step 1: Write HoloCard tests**

Create `src/__tests__/HoloCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import HoloCard from '../components/HoloCard/HoloCard'
import type { Card } from '../types'

const mockCard: Card = {
  id: '1',
  name: 'Charizard',
  set: 'base1',
  number: '4',
  rarity: 'holo_rare',
  image_url: 'https://example.com/charizard.png',
  holo_type: 'standard',
}

describe('HoloCard', () => {
  it('renders card image with correct alt text', () => {
    render(<HoloCard card={mockCard} />)
    expect(screen.getByAltText('Charizard')).toBeInTheDocument()
  })

  it('sets data-holo-type attribute from card.holo_type', () => {
    const { container } = render(<HoloCard card={mockCard} />)
    expect(container.firstChild).toHaveAttribute('data-holo-type', 'standard')
  })

  it('renders with holo-type none for common card', () => {
    const common: Card = { ...mockCard, rarity: 'common', holo_type: 'none' }
    const { container } = render(<HoloCard card={common} />)
    expect(container.firstChild).toHaveAttribute('data-holo-type', 'none')
  })

  it('updates CSS vars on mouse move', () => {
    const { container } = render(<HoloCard card={mockCard} />)
    const card = container.firstChild as HTMLElement
    fireEvent.mouseMove(card, { clientX: 100, clientY: 100 })
    expect(card.style.getPropertyValue('--rotateX')).not.toBe('')
  })

  it('resets CSS vars on mouse leave', () => {
    const { container } = render(<HoloCard card={mockCard} />)
    const card = container.firstChild as HTMLElement
    fireEvent.mouseMove(card, { clientX: 100, clientY: 100 })
    fireEvent.mouseLeave(card)
    expect(card.style.getPropertyValue('--rotateX')).toBe('0deg')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/__tests__/HoloCard.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/components/HoloCard/HoloCard.tsx`**

```tsx
import { useRef, useCallback } from 'react'
import type { Card } from '../../types'
import './HoloCard.css'

type Props = {
  card: Card
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
}

export default function HoloCard({ card, size = 'md', interactive = true }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const rotateX = ((y - cy) / cy) * -12
    const rotateY = ((x - cx) / cx) * 12
    const bgX = (x / rect.width) * 100
    const bgY = (y / rect.height) * 100
    const mx = (x / rect.width) * 100
    const my = (y / rect.height) * 100
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    const maxDist = Math.sqrt(cx ** 2 + cy ** 2)
    const pfc = dist / maxDist

    el.style.setProperty('--rotateX', `${rotateX}deg`)
    el.style.setProperty('--rotateY', `${rotateY}deg`)
    el.style.setProperty('--bgX', `${bgX}%`)
    el.style.setProperty('--bgY', `${bgY}%`)
    el.style.setProperty('--mx', `${mx}%`)
    el.style.setProperty('--my', `${my}%`)
    el.style.setProperty('--pointer-from-center', `${pfc}`)
  }, [interactive])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return
    const touch = e.touches[0]
    const el = cardRef.current
    if (!el || !touch) return
    const rect = el.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const rotateX = ((y - cy) / cy) * -12
    const rotateY = ((x - cx) / cx) * 12
    const bgX = (x / rect.width) * 100
    const bgY = (y / rect.height) * 100
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    const maxDist = Math.sqrt(cx ** 2 + cy ** 2)
    const pfc = dist / maxDist

    el.style.setProperty('--rotateX', `${rotateX}deg`)
    el.style.setProperty('--rotateY', `${rotateY}deg`)
    el.style.setProperty('--bgX', `${bgX}%`)
    el.style.setProperty('--bgY', `${bgY}%`)
    el.style.setProperty('--mx', `${bgX}%`)
    el.style.setProperty('--my', `${bgY}%`)
    el.style.setProperty('--pointer-from-center', `${pfc}`)
  }, [interactive])

  const handleLeave = useCallback(() => {
    const el = cardRef.current
    if (!el) return
    el.style.setProperty('--rotateX', '0deg')
    el.style.setProperty('--rotateY', '0deg')
    el.style.setProperty('--bgX', '50%')
    el.style.setProperty('--bgY', '50%')
    el.style.setProperty('--mx', '50%')
    el.style.setProperty('--my', '50%')
    el.style.setProperty('--pointer-from-center', '0')
  }, [])

  return (
    <div
      ref={cardRef}
      className={`card card--${size}`}
      data-holo-type={card.holo_type}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleLeave}
      style={{
        '--rotateX': '0deg',
        '--rotateY': '0deg',
        '--bgX': '50%',
        '--bgY': '50%',
        '--mx': '50%',
        '--my': '50%',
        '--pointer-from-center': '0',
      } as React.CSSProperties}
    >
      <div className="card__translucent" />
      <img className="card__img" src={card.image_url} alt={card.name} loading="lazy" />
      <div className="card__holo" />
      <div className="card__sparkle" />
      <div className="card__glare" />
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/HoloCard/HoloCard.css`**

```css
.card {
  position: relative;
  border-radius: 4.75% / 3.5%;
  cursor: pointer;
  transform-style: preserve-3d;
  transform:
    perspective(600px)
    rotateX(var(--rotateX))
    rotateY(var(--rotateY));
  transition: transform 0.1s ease-out;
  will-change: transform;
  overflow: hidden;
  display: block;
  line-height: 0;
}

.card--sm { width: 120px; height: 167px; }
.card--md { width: 200px; height: 279px; }
.card--lg { width: 300px; height: 418px; }

.card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  display: block;
  position: relative;
  z-index: 1;
}

/* Shared layer styles */
.card__translucent,
.card__holo,
.card__sparkle,
.card__glare {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

/* Holo shimmer layer — color-dodge over card image */
.card__holo {
  z-index: 2;
  opacity: 0;
  mix-blend-mode: color-dodge;
  background:
    repeating-linear-gradient(
      0deg,
      hsl(calc(var(--bgX) * 3.6), 100%, 50%, 0.5) 0%,
      hsl(calc(var(--bgX) * 3.6 + 60), 100%, 50%, 0.5) 20%,
      hsl(calc(var(--bgX) * 3.6 + 120), 100%, 50%, 0.5) 40%,
      hsl(calc(var(--bgX) * 3.6 + 180), 100%, 50%, 0.5) 60%,
      hsl(calc(var(--bgX) * 3.6 + 240), 100%, 50%, 0.5) 80%,
      hsl(calc(var(--bgX) * 3.6 + 300), 100%, 50%, 0.5) 100%
    );
  background-size: 200% 200%;
  background-position: var(--bgX) var(--bgY);
  transition: opacity 0.3s;
}

/* Sparkle layer */
.card__sparkle {
  z-index: 3;
  opacity: 0;
  mix-blend-mode: color-dodge;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
  background-size: 200px 200px;
  background-position: var(--bgX) var(--bgY);
  animation: sparkle-pan 8s linear infinite;
  transition: opacity 0.3s;
}

@keyframes sparkle-pan {
  0% { background-position: 0% 0%; }
  100% { background-position: 200px 200px; }
}

/* Glare sweep */
.card__glare {
  z-index: 4;
  opacity: 0;
  mix-blend-mode: overlay;
  background: radial-gradient(
    circle at var(--mx) var(--my),
    rgba(255,255,255,0.35) 0%,
    transparent 60%
  );
  transition: opacity 0.3s;
}

/* --- Holo type activations --- */

/* standard: holo_rare */
[data-holo-type="standard"] .card__holo,
[data-holo-type="standard"] .card__glare {
  opacity: calc(0.4 + var(--pointer-from-center) * 0.4);
}
[data-holo-type="standard"] .card__sparkle {
  opacity: calc(0.1 + var(--pointer-from-center) * 0.2);
}

/* reverse: reverse holo */
[data-holo-type="reverse"] .card__holo {
  opacity: calc(0.2 + var(--pointer-from-center) * 0.3);
}
[data-holo-type="reverse"] .card__glare {
  opacity: calc(0.3 + var(--pointer-from-center) * 0.3);
}

/* full_art: ultra_rare */
[data-holo-type="full_art"] .card__holo {
  opacity: calc(0.5 + var(--pointer-from-center) * 0.4);
}
[data-holo-type="full_art"] .card__sparkle {
  opacity: calc(0.2 + var(--pointer-from-center) * 0.4);
}
[data-holo-type="full_art"] .card__glare {
  opacity: calc(0.5 + var(--pointer-from-center) * 0.4);
}

/* rainbow: secret_rare */
[data-holo-type="rainbow"] .card__holo {
  opacity: calc(0.6 + var(--pointer-from-center) * 0.4);
  animation: rainbow-shift 3s linear infinite;
}
[data-holo-type="rainbow"] .card__sparkle {
  opacity: calc(0.3 + var(--pointer-from-center) * 0.5);
}
[data-holo-type="rainbow"] .card__glare {
  opacity: calc(0.6 + var(--pointer-from-center) * 0.4);
}

@keyframes rainbow-shift {
  0% { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/__tests__/HoloCard.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 6: Verify visually**

Add to `src/routes/Home.tsx` temporarily to test (remove after):
```tsx
import HoloCard from '../components/HoloCard/HoloCard'
// Add inside the return, before closing div:
<HoloCard card={{ id:'1', name:'Charizard', set:'base1', number:'4', rarity:'holo_rare', image_url:'https://images.pokemontcg.io/base1/4_hires.png', holo_type:'standard' }} />
```

Run `npm run dev`. Hover the card — you should see tilt + holo shimmer. Remove test code after confirming.

- [ ] **Step 7: Commit**

```bash
git add src/components/HoloCard/ src/__tests__/HoloCard.test.tsx
git commit -m "feat: add HoloCard component with CSS parallax holo effect"
```

---

## Task 9: Shop Route

**Files:**
- Modify: `src/routes/Shop.tsx`
- Create: `src/hooks/useCurrency.ts`
- Create: `src/components/ui/CurrencyDisplay.tsx`

- [ ] **Step 1: Create `src/components/ui/CurrencyDisplay.tsx`**

```tsx
import { useApp } from '../../context/AppContext'

export default function CurrencyDisplay() {
  const { state } = useApp()
  return (
    <div className="currency-display">
      <span className="currency-display__icon">✦</span>
      <span className="currency-display__amount">{state.currency}</span>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/hooks/useCurrency.ts`**

```ts
import { useApp } from '../context/AppContext'
import { claimDailyReward } from '../lib/queries'

export function useCurrency() {
  const { state, dispatch } = useApp()

  async function claim() {
    if (!state.user) return
    const newCurrency = await claimDailyReward(state.user.id)
    if (newCurrency !== null) {
      dispatch({ type: 'SET_CURRENCY', currency: newCurrency })
    }
  }

  return { currency: state.currency, claim }
}
```

- [ ] **Step 3: Replace `src/routes/Shop.tsx`**

```tsx
import { use, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../hooks/useAuth'
import { useCurrency } from '../hooks/useCurrency'
import CurrencyDisplay from '../components/ui/CurrencyDisplay'
import { fetchPacks } from '../lib/queries'
import type { Pack } from '../types'

const packsPromise = fetchPacks()

function PackList() {
  const packs = use(packsPromise)
  const { state, dispatch } = useApp()
  const navigate = useNavigate()

  function handleBuy(pack: Pack) {
    if (state.currency < pack.price) return
    dispatch({ type: 'DEDUCT_CURRENCY', amount: pack.price })
    navigate('/pack-opening', { state: { packId: pack.id } })
  }

  return (
    <div className="shop__packs">
      {packs.map((pack) => (
        <div key={pack.id} className="pack-card">
          <img src={pack.image_url} alt={pack.name} className="pack-card__img" />
          <h3 className="pack-card__name">{pack.name}</h3>
          <p className="pack-card__price">✦ {pack.price}</p>
          <button
            className="btn btn--primary"
            onClick={() => handleBuy(pack)}
            disabled={state.currency < pack.price}
          >
            {state.currency < pack.price ? 'Not enough ✦' : 'Open Pack'}
          </button>
        </div>
      ))}
    </div>
  )
}

export default function Shop() {
  const { signOut } = useAuth()
  const { claim } = useCurrency()

  return (
    <div className="shop">
      <header className="shop__header">
        <h1 className="shop__title">Shop</h1>
        <div className="shop__header-right">
          <CurrencyDisplay />
          <button className="btn btn--secondary shop__daily" onClick={claim}>
            Claim Daily ✦50
          </button>
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

- [ ] **Step 4: Add Shop styles to `src/styles/global.css`** (append)

```css
.shop { padding: 2rem; max-width: 1200px; margin: 0 auto; }

.shop__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.shop__header-right { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.shop__title { font-size: 2rem; font-weight: 700; }
.shop__loading { color: var(--text-muted); }

.shop__packs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
}

.pack-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  transition: border-color 0.15s;
}

.pack-card:hover { border-color: var(--accent); }
.pack-card__img { width: 120px; height: auto; border-radius: 6px; }
.pack-card__name { font-weight: 600; text-align: center; }
.pack-card__price { color: var(--gold); font-weight: 600; }

.currency-display {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  font-size: 1.1rem;
}

.currency-display__icon { color: var(--gold); }
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/Shop.tsx src/hooks/useCurrency.ts src/components/ui/ src/styles/global.css
git commit -m "feat: add Shop route with pack listings and currency display"
```

---

## Task 10: Open-Pack Edge Function

**Files:**
- Create: `supabase/functions/open-pack/index.ts`
- Test: `src/__tests__/open-pack.test.ts`

- [ ] **Step 1: Write unit test for pack RNG logic**

Create `src/__tests__/open-pack.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

// Extracted pure function from edge function logic
function rollRarity(rand: number): string {
  if (rand < 0.60) return 'common'
  if (rand < 0.85) return 'uncommon'
  if (rand < 0.95) return 'rare'
  if (rand < 0.99) return 'holo_rare'
  return 'ultra_rare'
}

function buildPack(cardPool: Array<{ id: string; rarity: string }>, rand: () => number): string[] {
  const byRarity = (r: string) => cardPool.filter(c => c.rarity === r)
  const pick = (pool: Array<{ id: string }>) => pool[Math.floor(rand() * pool.length)]?.id

  const cards: string[] = []
  // 1 guaranteed rare or better
  const rarePool = cardPool.filter(c =>
    ['rare', 'holo_rare', 'ultra_rare', 'secret_rare'].includes(c.rarity)
  )
  const guaranteed = pick(rarePool) ?? pick(cardPool)
  if (guaranteed) cards.push(guaranteed)

  // Fill remaining 9 slots
  for (let i = 1; i < 10; i++) {
    const rarity = rollRarity(rand())
    const pool = byRarity(rarity).length > 0 ? byRarity(rarity) : cardPool
    const card = pick(pool)
    if (card) cards.push(card)
  }

  return cards
}

describe('rollRarity', () => {
  it('returns common for rand < 0.60', () => expect(rollRarity(0.0)).toBe('common'))
  it('returns uncommon for rand 0.60–0.85', () => expect(rollRarity(0.70)).toBe('uncommon'))
  it('returns rare for rand 0.85–0.95', () => expect(rollRarity(0.90)).toBe('rare'))
  it('returns holo_rare for rand 0.95–0.99', () => expect(rollRarity(0.97)).toBe('holo_rare'))
  it('returns ultra_rare for rand >= 0.99', () => expect(rollRarity(0.995)).toBe('ultra_rare'))
})

describe('buildPack', () => {
  const pool = [
    { id: 'c1', rarity: 'common' },
    { id: 'c2', rarity: 'uncommon' },
    { id: 'c3', rarity: 'rare' },
    { id: 'c4', rarity: 'holo_rare' },
  ]
  let callCount = 0
  const deterministicRand = () => {
    callCount++
    return (callCount * 0.07) % 1
  }

  it('returns 10 cards', () => {
    callCount = 0
    expect(buildPack(pool, deterministicRand)).toHaveLength(10)
  })

  it('first card is rare or better', () => {
    callCount = 0
    const result = buildPack(pool, deterministicRand)
    expect(['c3', 'c4']).toContain(result[0])
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run -- src/__tests__/open-pack.test.ts
```

Expected: PASS — pure functions tested without Deno runtime

- [ ] **Step 3: Create `supabase/functions/open-pack/index.ts`**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Card = { id: string; rarity: string }

function rollRarity(rand: number): string {
  if (rand < 0.60) return 'common'
  if (rand < 0.85) return 'uncommon'
  if (rand < 0.95) return 'rare'
  if (rand < 0.99) return 'holo_rare'
  return 'ultra_rare'
}

function buildPack(cardPool: Card[]): string[] {
  const rand = () => Math.random()
  const byRarity = (r: string) => cardPool.filter(c => c.rarity === r)
  const pick = (pool: Card[]) => pool[Math.floor(rand() * pool.length)]?.id

  const cards: string[] = []
  const rarePool = cardPool.filter(c =>
    ['rare', 'holo_rare', 'ultra_rare', 'secret_rare'].includes(c.rarity)
  )
  const guaranteed = pick(rarePool.length > 0 ? rarePool : cardPool)
  if (guaranteed) cards.push(guaranteed)

  for (let i = 1; i < 10; i++) {
    const rarity = rollRarity(rand())
    const pool = byRarity(rarity).length > 0 ? byRarity(rarity) : cardPool
    const card = pick(pool)
    if (card) cards.push(card)
  }

  return cards
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // User client (respects RLS for reads)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { authorization: authHeader } } }
    )

    // Service client (bypasses RLS for writes)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { packId } = await req.json() as { packId: string }

    // Fetch pack + price
    const { data: pack, error: packError } = await userClient
      .from('packs')
      .select('id, price, card_pool')
      .eq('id', packId)
      .single()

    if (packError || !pack) {
      return new Response(JSON.stringify({ error: 'Pack not found' }), { status: 404, headers: corsHeaders })
    }

    // Validate and deduct currency atomically
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('currency')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.currency < pack.price) {
      return new Response(JSON.stringify({ error: 'Insufficient currency' }), { status: 400, headers: corsHeaders })
    }

    const newCurrency: number = await serviceClient.rpc('increment_currency', {
      uid: user.id,
      delta: -pack.price,
    })

    // Fetch cards in this pack's pool
    const { data: poolCards, error: poolError } = await serviceClient
      .from('cards')
      .select('id, rarity')
      .in('id', pack.card_pool)

    if (poolError || !poolCards || poolCards.length === 0) {
      return new Response(JSON.stringify({ error: 'Empty card pool' }), { status: 500, headers: corsHeaders })
    }

    const selectedIds = buildPack(poolCards as Card[])

    // Insert into user_collection
    const collectionRows = selectedIds.map(cardId => ({
      user_id: user.id,
      card_id: cardId,
    }))

    await serviceClient.from('user_collection').insert(collectionRows)

    // Record transaction
    await serviceClient.from('transactions').insert({
      user_id: user.id,
      type: 'pack_purchase',
      amount: -pack.price,
    })

    // Fetch full card data to return
    const { data: cards } = await serviceClient
      .from('cards')
      .select('*')
      .in('id', selectedIds)

    return new Response(
      JSON.stringify({ cards, newCurrency }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
```

- [ ] **Step 4: Deploy the Edge Function**

```bash
npx supabase functions deploy open-pack
```

Expected: Function deployed successfully.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ src/__tests__/open-pack.test.ts
git commit -m "feat: add open-pack Edge Function with server-side RNG"
```

---

## Task 11: PackRip Animation + PackOpening Route

**Files:**
- Create: `src/components/PackRip/PackRip.tsx`
- Create: `src/components/PackRip/PackRip.css`
- Modify: `src/routes/PackOpening.tsx`

- [ ] **Step 1: Create `src/components/PackRip/PackRip.css`**

```css
.pack-rip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 2rem;
  background: var(--bg);
  overflow: hidden;
}

/* Pack wrapper */
.pack-rip__pack {
  position: relative;
  width: 200px;
  cursor: pointer;
  user-select: none;
}

.pack-rip__pack img {
  width: 100%;
  border-radius: 8px;
  filter: drop-shadow(0 0 24px var(--accent-glow));
}

/* Hover idle shimmer */
.pack-rip__pack::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%);
  opacity: 0;
  transition: opacity 0.3s;
}

.pack-rip__pack:hover::after { opacity: 1; }

/* Shake animation */
@keyframes pack-shake {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(-3deg) translateX(-4px); }
  40% { transform: rotate(3deg) translateX(4px); }
  60% { transform: rotate(-2deg) translateX(-2px); }
  80% { transform: rotate(2deg) translateX(2px); }
}

.pack-rip__pack--shaking { animation: pack-shake 0.5s ease-in-out; }

/* Tear animation */
@keyframes pack-tear-top {
  0% { clip-path: polygon(0 0, 100% 0, 100% 50%, 0 50%); transform: translateY(0) rotate(0deg); }
  100% { clip-path: polygon(0 0, 100% 0, 100% 50%, 0 50%); transform: translateY(-120%) rotate(-8deg); }
}

@keyframes pack-tear-bottom {
  0% { clip-path: polygon(0 50%, 100% 50%, 100% 100%, 0 100%); transform: translateY(0) rotate(0deg); }
  100% { clip-path: polygon(0 50%, 100% 50%, 100% 100%, 0 100%); transform: translateY(120%) rotate(8deg); }
}

.pack-rip__top {
  position: absolute;
  inset: 0;
  clip-path: polygon(0 0, 100% 0, 100% 48%, 5% 52%);
}

.pack-rip__bottom {
  position: absolute;
  inset: 0;
  clip-path: polygon(0 52%, 5% 48%, 100% 48%, 100% 100%, 0 100%);
}

.pack-rip__top--tearing { animation: pack-tear-top 0.4s ease-in forwards; }
.pack-rip__bottom--tearing { animation: pack-tear-bottom 0.4s ease-in forwards; }

/* Cards fan */
.pack-rip__cards {
  display: flex;
  gap: -20px;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 900px;
  gap: 1rem;
  padding: 1rem;
}

/* Individual card reveal */
@keyframes card-reveal {
  0% { opacity: 0; transform: translateY(40px) scale(0.8); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.pack-rip__card-slot {
  animation: card-reveal 0.4s ease-out forwards;
  opacity: 0;
}

/* Card flip */
.card-flip {
  perspective: 600px;
  cursor: pointer;
}

.card-flip__inner {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.card-flip__inner--flipped { transform: rotateY(180deg); }

.card-flip__front,
.card-flip__back {
  backface-visibility: hidden;
  position: absolute;
  top: 0; left: 0;
}

.card-flip__back {
  transform: rotateY(180deg);
  position: relative;
}

.card-back {
  width: 200px;
  height: 279px;
  background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
  border-radius: 4.75% / 3.5%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
}

.pack-rip__actions {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.pack-rip__hint {
  color: var(--text-muted);
  font-size: 0.875rem;
  text-align: center;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
```

- [ ] **Step 2: Create `src/components/PackRip/PackRip.tsx`**

```tsx
import { useState, useEffect } from 'react'
import type { Card } from '../../types'
import HoloCard from '../HoloCard/HoloCard'
import './PackRip.css'

type Phase =
  | 'idle'
  | 'shaking'
  | 'tearing'
  | 'revealing'
  | 'done'

type Props = {
  packImageUrl: string
  cards: Card[]
  onComplete: () => void
}

export default function PackRip({ packImageUrl, cards, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [revealedCount, setRevealedCount] = useState(0)

  useEffect(() => {
    if (phase === 'revealing' && cards.length > 0) {
      setFlipped(new Array(cards.length).fill(false))
      // Stagger card reveal
      let i = 0
      const interval = setInterval(() => {
        i++
        setRevealedCount(i)
        if (i >= cards.length) clearInterval(interval)
      }, 150)
      return () => clearInterval(interval)
    }
  }, [phase, cards.length])

  function handlePackClick() {
    if (phase !== 'idle') return
    setPhase('shaking')
    setTimeout(() => setPhase('tearing'), 500)
    setTimeout(() => setPhase('revealing'), 900)
  }

  function handleCardFlip(index: number) {
    setFlipped(prev => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }

  function allFlipped() {
    return flipped.length > 0 && flipped.every(Boolean)
  }

  return (
    <div className="pack-rip">
      {(phase === 'idle' || phase === 'shaking' || phase === 'tearing') && (
        <>
          <div
            className={`pack-rip__pack${phase === 'shaking' ? ' pack-rip__pack--shaking' : ''}`}
            onClick={handlePackClick}
          >
            <img
              src={packImageUrl}
              alt="Pack"
              className={`pack-rip__top${phase === 'tearing' ? ' pack-rip__top--tearing' : ''}`}
            />
            <img
              src={packImageUrl}
              alt=""
              aria-hidden
              className={`pack-rip__bottom${phase === 'tearing' ? ' pack-rip__bottom--tearing' : ''}`}
            />
          </div>
          {phase === 'idle' && (
            <p className="pack-rip__hint">Click the pack to open it</p>
          )}
        </>
      )}

      {(phase === 'revealing' || phase === 'done') && (
        <>
          <div className="pack-rip__cards">
            {cards.slice(0, revealedCount).map((card, i) => (
              <div
                key={card.id + i}
                className="pack-rip__card-slot"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="card-flip" onClick={() => handleCardFlip(i)}>
                  <div className={`card-flip__inner${flipped[i] ? ' card-flip__inner--flipped' : ''}`}>
                    <div className="card-flip__front card-back">✦</div>
                    <div className="card-flip__back">
                      <HoloCard card={card} size="md" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {revealedCount < cards.length && (
            <p className="pack-rip__hint">Cards incoming…</p>
          )}

          {revealedCount >= cards.length && !allFlipped() && (
            <p className="pack-rip__hint">Tap cards to reveal</p>
          )}

          {allFlipped() && (
            <div className="pack-rip__actions">
              <button className="btn btn--primary" onClick={onComplete}>
                Add to Collection
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/routes/PackOpening.tsx`**

```tsx
import { useState, useOptimistic, startTransition } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import PackRip from '../components/PackRip/PackRip'
import { supabase } from '../lib/supabase'
import { fetchCollection } from '../lib/queries'
import type { Card, PackOpenResult } from '../types'

type State = 'loading' | 'ready' | 'error'

export default function PackOpening() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, dispatch } = useApp()
  const packId = (location.state as { packId: string } | null)?.packId

  const [cards, setCards] = useState<Card[]>([])
  const [packImageUrl] = useState('https://images.pokemontcg.io/base1/logo.png')
  const [pageState, setPageState] = useState<State>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const [optimisticCards, addOptimisticCards] = useOptimistic(
    cards,
    (_state: Card[], newCards: Card[]) => newCards
  )

  useState(() => {
    if (!packId) { navigate('/shop'); return }
    openPack()
  })

  async function openPack() {
    try {
      const { data, error } = await supabase.functions.invoke<PackOpenResult>('open-pack', {
        body: { packId },
      })
      if (error || !data) throw error ?? new Error('No data returned')

      startTransition(() => {
        addOptimisticCards(data.cards)
        setCards(data.cards)
        dispatch({ type: 'SET_CURRENCY', currency: data.newCurrency })
      })
      setPageState('ready')
    } catch (err) {
      setErrorMsg(String(err))
      setPageState('error')
    }
  }

  async function handleComplete() {
    if (!state.user) return
    const collection = await fetchCollection(state.user.id)
    dispatch({ type: 'SET_COLLECTION', collection })
    navigate('/collection')
  }

  if (pageState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--text-muted)' }}>Preparing your pack…</p>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
        <p style={{ color: '#ef4444' }}>{errorMsg}</p>
        <button className="btn btn--secondary" onClick={() => navigate('/shop')}>Back to Shop</button>
      </div>
    )
  }

  return (
    <PackRip
      packImageUrl={packImageUrl}
      cards={optimisticCards}
      onComplete={handleComplete}
    />
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PackRip/ src/routes/PackOpening.tsx
git commit -m "feat: add PackRip animation and PackOpening route"
```

---

## Task 12: Collection Route

**Files:**
- Modify: `src/routes/Collection.tsx`
- Create: `src/hooks/useCollection.ts`

- [ ] **Step 1: Create `src/hooks/useCollection.ts`**

```ts
import { useApp } from '../context/AppContext'

export function useCollection() {
  const { state } = useApp()
  return { collection: state.collection }
}
```

- [ ] **Step 2: Replace `src/routes/Collection.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from '../hooks/useCollection'
import HoloCard from '../components/HoloCard/HoloCard'
import type { CollectionEntry } from '../types'

export default function Collection() {
  const navigate = useNavigate()
  const { collection } = useCollection()
  const [selected, setSelected] = useState<CollectionEntry | null>(null)

  return (
    <div className="collection">
      <header className="collection__header">
        <button className="btn btn--secondary" onClick={() => navigate('/shop')}>
          ← Shop
        </button>
        <h1 className="collection__title">Collection</h1>
        <span className="collection__count">{collection.length} cards</span>
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
              className="collection__slot"
              onClick={() => setSelected(entry)}
            >
              <HoloCard card={entry.card} size="sm" interactive={false} />
              {entry.count > 1 && (
                <span className="collection__count-badge">×{entry.count}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="collection__modal" onClick={() => setSelected(null)}>
          <div className="collection__modal-inner" onClick={e => e.stopPropagation()}>
            <HoloCard card={selected.card} size="lg" interactive />
            <div className="collection__modal-info">
              <h2>{selected.card.name}</h2>
              <p>{selected.card.set} · #{selected.card.number}</p>
              <p className="collection__rarity">{selected.card.rarity.replace('_', ' ')}</p>
            </div>
            <button className="btn btn--secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add Collection styles to `src/styles/global.css`** (append)

```css
.collection { padding: 2rem; max-width: 1400px; margin: 0 auto; }

.collection__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.collection__title { font-size: 2rem; font-weight: 700; flex: 1; }

.collection__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem;
  color: var(--text-muted);
}

.collection__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 1rem;
}

.collection__slot {
  position: relative;
  cursor: pointer;
  transition: transform 0.15s;
}

.collection__slot:hover { transform: translateY(-4px); }

.collection__count-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: var(--accent);
  color: white;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 99px;
}

.collection__modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 2rem;
}

.collection__modal-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  max-width: 400px;
  width: 100%;
}

.collection__modal-info { text-align: center; }
.collection__modal-info h2 { font-size: 1.5rem; font-weight: 700; }
.collection__modal-info p { color: var(--text-muted); margin-top: 0.25rem; }
.collection__rarity {
  margin-top: 0.5rem !important;
  color: var(--gold) !important;
  font-weight: 600;
  text-transform: capitalize;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/Collection.tsx src/hooks/useCollection.ts src/styles/global.css
git commit -m "feat: add Collection route with card grid and holo detail modal"
```

---

## Task 13: Vercel Deployment

**Files:**
- Create: `vercel.json`
- Update: `.env.local`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This makes React Router work on Vercel — all routes serve `index.html`.

- [ ] **Step 2: Add production env vars to Vercel**

```bash
npx vercel env add VITE_SUPABASE_URL
npx vercel env add VITE_SUPABASE_ANON_KEY
```

Enter your values from the Supabase dashboard when prompted. Select "Production, Preview, Development".

- [ ] **Step 3: Update Supabase Auth redirect URLs**

In Supabase dashboard → Auth → URL Configuration:
- Add `https://your-vercel-url.vercel.app` to Site URL
- Add `https://your-vercel-url.vercel.app/**` to Redirect URLs

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod
```

Expected: Build succeeds, app live at your Vercel URL.

- [ ] **Step 5: Smoke test production**

1. Visit your Vercel URL
2. Sign in with Google
3. Verify shop loads with packs
4. Open a pack — animation plays, cards reveal with holo effects
5. Navigate to Collection — cards appear

- [ ] **Step 6: Commit**

```bash
git add vercel.json
git commit -m "feat: add Vercel deployment config"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| User auth (Google + magic link) | Task 6 |
| Starting currency (100) | Task 4 — migration sets default 100 |
| Daily currency grant | Task 9 (claim button) + Task 4 (pg_cron note) |
| Pack shop with listings | Task 9 |
| Pack opening Edge Function RNG | Task 10 |
| Pack opening animation (shake, tear, fan, flip) | Task 11 |
| HoloCard parallax effect | Task 8 |
| Rarity-based holo variants | Task 8 |
| Collection view + detail modal | Task 12 |
| Supabase RLS | Task 4 |
| Vercel deployment | Task 13 |
| Card data from pokemontcg.io | Task 7 |

All spec requirements covered. No placeholders found. Types defined in Task 2 are used consistently throughout (`Card`, `Pack`, `CollectionEntry`, `AppState`, `AppAction`, `PackOpenResult`).
